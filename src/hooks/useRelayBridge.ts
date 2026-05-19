"use client";

import { useState, useCallback, useRef } from "react";
import { useAccount, useSwitchChain, usePublicClient, useWalletClient } from "wagmi";
import { erc20Abi, maxUint256, parseUnits } from "viem";
import { CHAIN_MAP } from "@/lib/wagmi";
import {
  Quote,
  formatUSDC,
} from "@/lib/quotes/types";
import { extractRelayTxs, pollRelayStatus } from "@/lib/quotes/relay";
import { friendlyError } from "@/lib/error-messages";

export type RelayBridgeStatus =
  | "idle"
  | "approving"
  | "depositing"
  | "filling"
  | "complete"
  | "error";

export interface RelayBridgeState {
  status: RelayBridgeStatus;
  approveTxHash?: `0x${string}`;
  depositTxHash?: `0x${string}`;
  fillTxHash?: `0x${string}`;
  requestId?: string;
  fillStatusMessage?: string;
  errorMessage?: string;
}

const initialState: RelayBridgeState = { status: "idle" };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * useRelayBridge — single-step intent-based bridging via Relay.link
 *
 * Flow:
 *   1. (optional) Approve USDC for Relay depository
 *   2. Deposit tx on source chain (with intent payload)
 *   3. Poll Relay status until solver fills on dest chain
 *   4. Done — USDC arrives in user wallet on dest chain (no manual mint)
 */
export function useRelayBridge() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [state, setState] = useState<RelayBridgeState>(initialState);
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

      if (quote.provider !== "relay" || quote.status !== "available") {
        setState({ status: "error", errorMessage: "Invalid Relay quote" });
        return;
      }

      const txs = extractRelayTxs(quote);
      if (!txs) {
        setState({ status: "error", errorMessage: "Failed to extract Relay tx data" });
        return;
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const { sourceChain } = quote;

        // Ensure wallet on source chain
        if (walletClient.chain?.id !== sourceChain) {
          await switchChainAsync({ chainId: sourceChain });
        }

        // ============ STEP 1: Approve (optional) ============
        if (txs.approveTx) {
          setState({ status: "approving" });

          const approveHash = await walletClient.sendTransaction({
            to: txs.approveTx.to,
            data: txs.approveTx.data,
            value: txs.approveTx.value,
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

        // ============ STEP 2: Deposit (intent submission) ============
        setState((s) => ({ ...s, status: "depositing" }));

        const depositHash = await walletClient.sendTransaction({
          to: txs.depositTx.to,
          data: txs.depositTx.data,
          value: txs.depositTx.value,
          chain: CHAIN_MAP[sourceChain],
          account: address,
        });

        setState((s) => ({
          ...s,
          depositTxHash: depositHash,
          requestId: txs.requestId,
        }));

        // Wait for source chain confirmation
        await publicClient.waitForTransactionReceipt({
          hash: depositHash,
          timeout: 180_000,
          pollingInterval: 2_000,
        });

        // ============ STEP 3: Poll Relay status ============
        setState((s) => ({
          ...s,
          status: "filling",
          fillStatusMessage: "Waiting for solver to fill on destination",
        }));

        const startedAt = Date.now();
        let pollAttempt = 0;

        while (true) {
          if (abortController.signal.aborted) {
            throw new Error("Bridge cancelled");
          }

          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw new Error("Timed out waiting for Relay solver to fill");
          }

          const status = await pollRelayStatus(txs.requestId, abortController.signal);
          pollAttempt++;

          if (status.status === "success") {
            setState((s) => ({
              ...s,
              status: "complete",
              fillTxHash: status.txHashes?.destination as `0x${string}` | undefined,
              fillStatusMessage: undefined,
            }));
            return;
          }

          if (status.status === "failed") {
            throw new Error(status.error || "Relay bridge failed");
          }

          // Pending — wait and retry
          setState((s) => ({
            ...s,
            fillStatusMessage: `Filling on destination (${pollAttempt}s)`,
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
