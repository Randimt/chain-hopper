"use client";

import { useState, useCallback, useRef } from "react";
import {
  useAccount,
  useSwitchChain,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { USDC_ADDRESSES, CHAIN_MAP } from "@/lib/wagmi";
import { decodeEventLog, erc20Abi, maxUint256 } from "viem";
import { Quote } from "@/lib/quotes/types";
import {
  extractAcrossDeposit,
  pollAcrossStatus,
  SPOKE_POOL_ABI,
} from "@/lib/quotes/across";
import { friendlyError } from "@/lib/error-messages";

export type AcrossBridgeStatus =
  | "idle"
  | "approving"
  | "depositing"
  | "filling"
  | "complete"
  | "error";

export interface AcrossBridgeState {
  status: AcrossBridgeStatus;
  approveTxHash?: `0x${string}`;
  depositTxHash?: `0x${string}`;
  fillTxHash?: `0x${string}`;
  depositId?: string;
  fillStatusMessage?: string;
  errorMessage?: string;
}

const initialState: AcrossBridgeState = { status: "idle" };

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * useAcrossBridge — optimistic intent-based bridging via Across Protocol
 *
 * Flow:
 *   1. Approve USDC for the SpokePool contract on source chain
 *   2. Call depositV3() on SpokePool — emits V3FundsDeposited event
 *   3. Extract depositId from event logs
 *   4. Poll Across status until relayer fills on dest chain
 *   5. Done — USDC arrives in user wallet (no manual claim)
 */
export function useAcrossBridge() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [state, setState] = useState<AcrossBridgeState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  const bridge = useCallback(
    async (quote: Quote) => {
      if (!address || !walletClient || !publicClient) {
        setState({ status: "error", errorMessage: "Wallet not connected" });
        return;
      }

      if (quote.provider !== "across" || quote.status !== "available") {
        setState({ status: "error", errorMessage: "Invalid Across quote" });
        return;
      }

      // Pull custom recipient from settings if set
      let recipient: `0x${string}` | undefined;
      if (typeof window !== "undefined") {
        try {
          const settings = JSON.parse(
            localStorage.getItem("plix:settings") || "{}",
          );
          if (
            settings.customRecipient &&
            /^0x[a-fA-F0-9]{40}$/.test(settings.customRecipient)
          ) {
            recipient = settings.customRecipient as `0x${string}`;
          }
        } catch {
          // Bad JSON — fall through to default recipient
        }
      }

      const deposit = extractAcrossDeposit(quote, address, recipient);
      if (!deposit) {
        setState({ status: "error", errorMessage: "Failed to extract Across deposit data" });
        return;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const { sourceChain } = quote;
        const sourceUsdc = USDC_ADDRESSES[sourceChain];
        if (!sourceUsdc) {
          throw new Error("USDC contract not found for source chain");
        }

        // Ensure wallet on source chain
        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
        }

        // ============ STEP 1: Check + Approve USDC ============
        const allowance = await publicClient.readContract({
          address: sourceUsdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, deposit.spokePoolAddress],
        });

        if (allowance < deposit.inputAmount) {
          setState({ status: "approving" });

          const approveHash = await walletClient.writeContract({
            address: sourceUsdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [deposit.spokePoolAddress, maxUint256],
            chain: CHAIN_MAP[sourceChain],
            account: address,
          });

          setState((s) => ({ ...s, approveTxHash: approveHash }));

          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            timeout: 180_000,
            pollingInterval: 2_000,
          });
        }

        // ============ STEP 2: depositV3 on SpokePool ============
        setState((s) => ({ ...s, status: "depositing" }));

        const depositHash = await walletClient.writeContract({
          address: deposit.spokePoolAddress,
          abi: SPOKE_POOL_ABI,
          functionName: "depositV3",
          args: [
            deposit.depositor,
            deposit.recipient,
            deposit.inputToken,
            deposit.outputToken,
            deposit.inputAmount,
            deposit.outputAmount,
            deposit.destinationChainId,
            deposit.exclusiveRelayer,
            deposit.quoteTimestamp,
            deposit.fillDeadline,
            deposit.exclusivityDeadline,
            deposit.message,
          ],
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        setState((s) => ({ ...s, depositTxHash: depositHash }));

        // Wait for source chain confirmation + extract depositId from event
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: depositHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        // Extract depositId from V3FundsDeposited / FundsDeposited event
        // Across has shipped multiple event versions — try all variants
        let depositId: string | undefined;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: SPOKE_POOL_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (
              decoded.eventName === "V3FundsDeposited" ||
              decoded.eventName === "FundsDeposited"
            ) {
              depositId = decoded.args.depositId.toString();
              break;
            }
          } catch {
            // Not a deposit event, skip
          }
        }

        if (!depositId) {
          // Fallback: tx is on-chain (we have receipt) but event format unknown
          // Mark complete so user isn't blocked. They can verify via deposit tx hash.
          // Status polling won't work without depositId, but funds will arrive on dest.
          console.warn(
            "[Across] Could not extract depositId from event logs. " +
              "Tx confirmed on-chain. Skipping fill polling — verify via explorer.",
            { txHash: depositHash, logCount: receipt.logs.length },
          );
          setState((s) => ({
            ...s,
            status: "complete",
            fillStatusMessage: undefined,
          }));
          return;
        }

        setState((s) => ({ ...s, depositId }));

        // ============ STEP 3: Poll Across status ============
        setState((s) => ({
          ...s,
          status: "filling",
          fillStatusMessage: "Waiting for relayer to fill on destination",
        }));

        const startedAt = Date.now();
        let pollAttempt = 0;

        while (true) {
          if (abortController.signal.aborted) {
            throw new Error("Bridge cancelled");
          }

          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error("Timed out waiting for Across relayer to fill");
          }

          const status = await pollAcrossStatus(
            sourceChain,
            depositId,
            abortController.signal,
          );
          pollAttempt++;

          if (status.status === "filled") {
            setState((s) => ({
              ...s,
              status: "complete",
              fillTxHash: status.fillTxHash as `0x${string}` | undefined,
              fillStatusMessage: undefined,
            }));
            return;
          }

          if (status.status === "expired") {
            throw new Error("Across deposit expired without fill");
          }

          // Pending — wait and retry
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          setState((s) => ({
            ...s,
            fillStatusMessage: `Filling on destination (${elapsed}s, attempt ${pollAttempt})`,
          }));

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
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
    [address, walletClient, publicClient, switchChainAsync],
  );

  return { state, bridge, reset };
}
