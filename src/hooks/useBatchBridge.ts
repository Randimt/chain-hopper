"use client";

import { useCallback, useState } from "react";
import { erc20Abi, padHex, maxUint256, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";

import { CHAIN_MAP, USDC_ADDRESSES } from "@/lib/wagmi";
import {
  LYXSA_SPLITTER_ABI,
  getSplitterAddress,
  isBatchBridgeSupported,
  MAX_BATCH_DESTINATIONS,
  type BurnLeg,
} from "@/lib/lyxsa-splitter";
import { CCTP_DOMAINS, FINALITY_FAST } from "@/lib/cctp";
import { waitForChainSync } from "@/lib/wait-for-chain";
import { friendlyError } from "@/lib/error-messages";
import {
  addBridgeRecord,
  generateBridgeId,
  type BridgeRecord,
} from "@/lib/bridge-history";

export type BatchOutput = {
  destChainId: number;
  amountRaw: bigint; // USDC raw (6 decimals)
  recipient: Address; // EVM destination address
};

export type UseBatchBridgeArgs = {
  sourceChain: number;
  outputs: BatchOutput[];
  totalAmountRaw: bigint;
};

export type BatchBridgeState =
  | { status: "idle" }
  | { status: "approving" }
  | { status: "approved"; approveTxHash: Hex }
  | { status: "burning" }
  | {
      status: "burned";
      batchTxHash: Hex;
      messageHashes: Hex[];
      legs: BatchOutput[];
      recordIds: string[]; // saved bridge-history record IDs (1 per leg)
    }
  | { status: "error"; errorMessage: string };

const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036" as const;

export function useBatchBridge() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  const [state, setState] = useState<BatchBridgeState>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  /**
   * Approve LyxsaSplitter to spend USDC on source chain.
   * Idempotent — skips if existing allowance is sufficient.
   */
  const approve = useCallback(
    async (sourceChain: number, amountRaw: bigint) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }
      if (!isBatchBridgeSupported(sourceChain)) {
        setState({
          status: "error",
          errorMessage: `Batch bridge not deployed on chain ${sourceChain} yet`,
        });
        return;
      }

      try {
        setState({ status: "approving" });

        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
          await waitForChainSync(publicClient, sourceChain);
        }

        const usdc = USDC_ADDRESSES[sourceChain];
        const splitter = getSplitterAddress(sourceChain)!;
        if (!usdc) throw new Error(`No USDC for chain ${sourceChain}`);

        // Check existing allowance — skip approve if sufficient
        const currentAllowance = await publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, splitter],
        });

        if (currentAllowance >= amountRaw) {
          setState({
            status: "approved",
            approveTxHash:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
          });
          return;
        }

        const txHash = await walletClient.writeContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [splitter, maxUint256],
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        setState({ status: "approved", approveTxHash: txHash });
      } catch (err) {
        setState({ status: "error", errorMessage: friendlyError(err) });
      }
    },
    [address, walletClient, publicClient, switchChainAsync],
  );

  /**
   * Execute batchBurn — calls LyxsaSplitter with N legs (max 5).
   * Returns the batch tx hash + extracted message hashes for attestation tracking.
   */
  const batchBurn = useCallback(
    async ({ sourceChain, outputs, totalAmountRaw }: UseBatchBridgeArgs) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }
      if (outputs.length === 0) {
        setState({ status: "error", errorMessage: "Add at least one destination" });
        return;
      }
      if (outputs.length > MAX_BATCH_DESTINATIONS) {
        setState({
          status: "error",
          errorMessage: `Maximum ${MAX_BATCH_DESTINATIONS} destinations per batch`,
        });
        return;
      }
      const splitter = getSplitterAddress(sourceChain);
      if (!splitter) {
        setState({
          status: "error",
          errorMessage: `Batch bridge not deployed on chain ${sourceChain} yet`,
        });
        return;
      }

      try {
        setState({ status: "burning" });

        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
          await waitForChainSync(publicClient, sourceChain);
        }

        // Build BurnLeg[] from UI outputs
        const legs: BurnLeg[] = outputs.map((out) => {
          const destDomain = CCTP_DOMAINS[out.destChainId];
          if (destDomain === undefined) {
            throw new Error(`No CCTP domain mapping for chain ${out.destChainId}`);
          }
          return {
            amount: out.amountRaw,
            destinationDomain: destDomain,
            // EVM recipient: left-pad address to bytes32
            mintRecipient: padHex(out.recipient, { size: 32 }),
            maxFee: 0n, // accept default Circle fee
            minFinalityThreshold: FINALITY_FAST, // 1000 = ~30s
          };
        });

        const txHash = await walletClient.writeContract({
          address: splitter,
          abi: LYXSA_SPLITTER_ABI,
          functionName: "batchBurn",
          args: [legs],
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        // Extract MessageSent events from CCTP MessageTransmitter
        // Each leg emits exactly one MessageSent — we order by log position
        const messageHashes: Hex[] = receipt.logs
          .filter((log) => log.topics[0] === MESSAGE_SENT_TOPIC)
          .map((log) => log.data as Hex);

        if (messageHashes.length !== outputs.length) {
          // soft warning — proceed anyway with what we have
          console.warn(
            `Expected ${outputs.length} MessageSent events, got ${messageHashes.length}`,
          );
        }

        // ─────────────────────────────────────────────────────────────
        // Save 1 BridgeRecord per leg as reclaimable (status="pending").
        // Stage 8 will polish: claim flow + parse messageBytes + auto-mint.
        // For now, user has full record + can manually claim via /history.
        // ─────────────────────────────────────────────────────────────
        const startedAt = Date.now();
        const recordIds: string[] = [];
        for (let i = 0; i < outputs.length; i++) {
          const out = outputs[i];
          const recordId = generateBridgeId();
          recordIds.push(recordId);
          const record: BridgeRecord = {
            id: recordId,
            provider: "cctp",
            sourceChain,
            destChain: out.destChainId,
            // amount in USDC display units (6 decimals), as string
            amount: (Number(out.amountRaw) / 1_000_000).toString(),
            status: "pending",
            burnTxHash: txHash,
            startedAt,
            reclaimable: true,
            recipeId: undefined,
            recipeName: undefined,
          };
          try {
            addBridgeRecord(address!, record);
          } catch (e) {
            // localStorage failure shouldn't block the rest of the batch
            console.error("[batch] Failed to save record", i, e);
          }
        }
        // Notify other components (history page) that records changed
        try {
          window.dispatchEvent(new CustomEvent("lyxsa:bridge-history-updated"));
        } catch {
          /* SSR or non-browser */
        }

        setState({
          status: "burned",
          batchTxHash: txHash,
          messageHashes,
          legs: outputs,
          recordIds,
        });
      } catch (err) {
        setState({ status: "error", errorMessage: friendlyError(err) });
      }
    },
    [address, walletClient, publicClient, switchChainAsync],
  );

  return { state, approve, batchBurn, reset };
}
