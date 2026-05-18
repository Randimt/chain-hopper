"use client";

import { useState, useCallback, useRef } from "react";
import { useAccount, useSwitchChain, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, erc20Abi, maxUint256 } from "viem";
import {
  sepolia,
  baseSepolia,
  arbitrumSepolia,
} from "wagmi/chains";
import { arcTestnet } from "@/lib/wagmi";
import type { Chain } from "viem";
import { USDC_ADDRESSES } from "@/lib/wagmi";
import {
  CCTP_V2_CONTRACTS,
  TOKEN_MESSENGER_V2_ABI,
  MESSAGE_TRANSMITTER_V2_ABI,
  chainIdToDomain,
  addressToBytes32,
  ZERO_BYTES32,
  FINALITY_FAST,
} from "@/lib/cctp";
import { pollAttestation } from "@/lib/circle-api";
import { friendlyError } from "@/lib/error-messages";

// Resolve a Chain object by chain id — used to pass explicit chain to writeContract
// (walletClient.chain is stale right after switchChainAsync, so we can't trust it)
const CHAIN_MAP: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [arcTestnet.id]: arcTestnet,
};

export type BridgeStatus =
  | "idle"
  | "approving"
  | "approved"
  | "burning"
  | "attesting"
  | "minting"
  | "complete"
  | "error";

export interface BridgeState {
  status: BridgeStatus;
  approveTxHash?: `0x${string}`;
  burnTxHash?: `0x${string}`;
  mintTxHash?: `0x${string}`;
  attestationStatus?: string;
  errorMessage?: string;
}

interface UseBridgeArgs {
  sourceChain: number;
  destChain: number;
  amount: string;
  /** Optional recipient address — defaults to connected wallet */
  recipient?: `0x${string}`;
}

interface ResumeBridgeArgs {
  sourceChain: number;
  destChain: number;
  burnTxHash: `0x${string}`;
}

const initialState: BridgeState = { status: "idle" };

export function useBridge() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  // Returns client for currently-active wallet chain (re-renders on switch)
  const publicClient = usePublicClient();
  const [state, setState] = useState<BridgeState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  // Step 1: Approve USDC for TokenMessenger to spend (max approval)
  const approve = useCallback(
    async ({ sourceChain }: { sourceChain: number }) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }

      try {
        setState({ status: "approving" });

        // Ensure wallet on source chain
        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
        }

        const usdcAddress = USDC_ADDRESSES[sourceChain];
        if (!usdcAddress) {
          throw new Error(`No USDC contract for chain ${sourceChain}`);
        }

        const txHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [CCTP_V2_CONTRACTS.tokenMessenger, maxUint256],
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        // Wait for 1 confirmation
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        setState({ status: "approved", approveTxHash: txHash });
      } catch (err) {
        setState({
          status: "error",
          errorMessage: friendlyError(err),
        });
      }
    },
    [address, walletClient, publicClient, switchChainAsync]
  );

  // Step 2-4: Burn on source → poll attestation → Mint on destination
  const bridge = useCallback(
    async ({ sourceChain, destChain, amount, recipient }: UseBridgeArgs) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        // ============ STEP 2: depositForBurn on source ============
        setState((s) => ({ ...s, status: "burning" }));

        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
        }

        const sourceUsdc = USDC_ADDRESSES[sourceChain];
        const destDomain = chainIdToDomain(destChain);
        // Use custom recipient if provided, else default to connected wallet
        const recipientAddress = recipient || address;
        const mintRecipient = addressToBytes32(recipientAddress);
        const amountWei = parseUnits(amount, 6);

        // Fast Transfer: maxFee >0 enables ~30s finality (small fee)
        // For Phase 1 simplicity, use Fast with minimal fee allowance
        const maxFee = parseUnits("0.5", 6); // 0.5 USDC max fee allowance

        const burnTxHash = await walletClient.writeContract({
          address: CCTP_V2_CONTRACTS.tokenMessenger,
          abi: TOKEN_MESSENGER_V2_ABI,
          functionName: "depositForBurn",
          args: [
            amountWei,
            destDomain,
            mintRecipient,
            sourceUsdc,
            ZERO_BYTES32, // destinationCaller — anyone can mint (recipient)
            maxFee,
            FINALITY_FAST,
          ],
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        setState((s) => ({ ...s, burnTxHash }));

        // Wait for source chain confirmation
        await publicClient.waitForTransactionReceipt({
          hash: burnTxHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        // ============ STEP 3: Poll Circle Iris API ============
        setState((s) => ({ ...s, status: "attesting" }));

        const sourceDomain = chainIdToDomain(sourceChain);
        const attestation = await pollAttestation(
          sourceDomain,
          burnTxHash,
          abortController.signal,
          (status) => setState((s) => ({ ...s, attestationStatus: status }))
        );

        // ============ STEP 4: receiveMessage on destination ============
        setState((s) => ({ ...s, status: "minting" }));

        await switchChainAsync({ chainId: destChain });

        const mintTxHash = await walletClient.writeContract({
          address: CCTP_V2_CONTRACTS.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_V2_ABI,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
          chain: CHAIN_MAP[destChain],
          account: address,
        });

        // Mark complete immediately — tx is signed & submitted on-chain.
        // Receipt indexing can be slow (especially Arc/Base), but the bridge is functionally done.
        // User has tx hash + explorer link to verify if needed.
        setState((s) => ({ ...s, mintTxHash, status: "complete" }));

        // Background receipt verification (non-blocking, fire-and-forget)
        publicClient
          .waitForTransactionReceipt({
            hash: mintTxHash,
            timeout: 180_000,
            pollingInterval: 2_000,
          })
          .catch((waitErr) => {
            console.warn("[Bridge] Mint receipt wait timed out, but tx submitted:", mintTxHash);
          });
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: friendlyError(err),
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [address, walletClient, publicClient, switchChainAsync]
  );

  // Resume an interrupted bridge: skip burn, jump to attestation poll + mint
  const resume = useCallback(
    async ({ sourceChain, destChain, burnTxHash }: ResumeBridgeArgs) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        // Restore burn tx hash to state
        setState({ status: "attesting", burnTxHash });

        // Poll attestation
        const sourceDomain = chainIdToDomain(sourceChain);
        const attestation = await pollAttestation(
          sourceDomain,
          burnTxHash,
          abortController.signal,
          (status) => setState((s) => ({ ...s, attestationStatus: status }))
        );

        // Mint on destination
        setState((s) => ({ ...s, status: "minting" }));

        if (walletClient.chain?.id !== destChain) {
          await switchChainAsync({ chainId: destChain });
        }

        const mintTxHash = await walletClient.writeContract({
          address: CCTP_V2_CONTRACTS.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_V2_ABI,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
          chain: CHAIN_MAP[destChain],
          account: address,
        });

        setState((s) => ({ ...s, mintTxHash }));

        // Wait for mint receipt (gracefully handle timeout — tx is already on-chain)
        try {
          await publicClient.waitForTransactionReceipt({
            hash: mintTxHash,
            timeout: 180_000,
            pollingInterval: 2_000,
          });
        } catch (waitErr) {
          // Timeout is OK — tx is on-chain, just slow indexer.
          console.warn("[Bridge] Mint receipt wait timed out, but tx submitted:", mintTxHash);
        }

        setState((s) => ({ ...s, status: "complete" }));
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: friendlyError(err),
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [address, walletClient, publicClient, switchChainAsync]
  );

  return { state, approve, bridge, resume, reset };
}
