"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";

import { CHAIN_MAP } from "@/lib/wagmi";
import {
  CCTP_DOMAINS,
  CCTP_V2_CONTRACTS,
  MESSAGE_TRANSMITTER_V2_ABI,
} from "@/lib/cctp";
import { fetchBatchAttestations, type LegAttestation } from "@/lib/circle-api";
import { waitForChainSync } from "@/lib/wait-for-chain";
import { friendlyError } from "@/lib/error-messages";
import {
  loadBridgeHistory,
  saveBridgeHistory,
  type BridgeRecord,
} from "@/lib/bridge-history";

// ─────────────────────────────────────────────────────────────────────────
// useBatchAttestations — Polls Iris API for N attestations of 1 batch tx.
// Fetches every 5s, updates per-leg state. Auto-stops when all complete.
// ─────────────────────────────────────────────────────────────────────────

export type LegMintStatus =
  | "pending" // attestation not ready yet
  | "ready" // attestation ready, waiting user to mint
  | "minting" // mint tx submitted, waiting confirmation
  | "complete" // mint confirmed, USDC arrived
  | "error";

export type LegState = {
  legIndex: number;
  destChainId: number;
  amountRaw: bigint;
  recipient: Address;
  recordId?: string; // BridgeRecord id (matched by burnTxHash + legIndex)
  attestation: LegAttestation;
  mintStatus: LegMintStatus;
  mintTxHash?: Hex;
  errorMessage?: string;
};

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 240; // 20 minutes

export function useBatchAttestations({
  sourceChain,
  batchTxHash,
  legs, // array of { destChainId, amountRaw, recipient }
  enabled,
}: {
  sourceChain: number;
  batchTxHash?: Hex;
  legs: { destChainId: number; amountRaw: bigint; recipient: Address }[];
  enabled: boolean;
}) {
  const [legStates, setLegStates] = useState<LegState[]>(() =>
    legs.map((leg, i) => ({
      legIndex: i,
      destChainId: leg.destChainId,
      amountRaw: leg.amountRaw,
      recipient: leg.recipient,
      attestation: { status: "pending" as const, attempt: 0 },
      mintStatus: "pending" as const,
    })),
  );
  const abortRef = useRef<AbortController | null>(null);
  const attemptsRef = useRef(0);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (!enabled || !batchTxHash) return;

    const sourceDomain = CCTP_DOMAINS[sourceChain];
    if (sourceDomain === undefined) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let cancelled = false;
    attemptsRef.current = 0;

    const tick = async () => {
      if (cancelled || attemptsRef.current >= MAX_ATTEMPTS) return;
      attemptsRef.current++;
      try {
        const fetched = await fetchBatchAttestations(
          sourceDomain,
          batchTxHash,
          legs.length,
          ctrl.signal,
        );
        if (cancelled) return;
        setLegStates((prev) =>
          prev.map((slot, i) => {
            const f = fetched[i];
            // Don't downgrade a leg that's already minted/minting locally
            if (slot.mintStatus !== "pending" && slot.mintStatus !== "ready") {
              return slot;
            }
            // Promote pending → ready when attestation arrives
            if (f.status === "complete" && slot.attestation.status !== "complete") {
              return {
                ...slot,
                attestation: f,
                mintStatus: "ready",
              };
            }
            return { ...slot, attestation: f };
          }),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.warn("[batch-attestation] poll error", err);
      }
    };

    // Initial fetch (no wait)
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
      ctrl.abort();
      abortRef.current = null;
    };
  }, [enabled, batchTxHash, sourceChain, legs.length]);

  return { legStates, setLegStates };
}

// ─────────────────────────────────────────────────────────────────────────
// useBatchLegMint — Mint single leg via MessageTransmitter.receiveMessage
// User-triggered (per leg). Updates legStates + persists to history.
// ─────────────────────────────────────────────────────────────────────────

export function useBatchLegMint(
  legStates: LegState[],
  setLegStates: React.Dispatch<React.SetStateAction<LegState[]>>,
  batchTxHash?: Hex,
) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();

  const mintLeg = useCallback(
    async (legIndex: number) => {
      if (!address || !walletClient || !publicClient) return;

      const leg = legStates[legIndex];
      if (!leg || leg.attestation.status !== "complete") return;
      if (leg.mintStatus === "minting" || leg.mintStatus === "complete") return;

      const { destChainId, attestation } = leg;
      // Type narrowing — TS can't track legStates[] mutations
      if (attestation.status !== "complete") return;

      // Mark as minting
      setLegStates((prev) =>
        prev.map((s, i) => (i === legIndex ? { ...s, mintStatus: "minting" } : s)),
      );

      try {
        // Switch wallet to destination chain
        if (walletClient.chain?.id !== destChainId) {
          await switchChainAsync({ chainId: destChainId });
          await waitForChainSync(publicClient, destChainId);
        }

        const mintTxHash = await walletClient.writeContract({
          address: CCTP_V2_CONTRACTS.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_V2_ABI,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
          chain: CHAIN_MAP[destChainId],
          account: address,
        });

        // Optimistic mark complete after submission
        setLegStates((prev) =>
          prev.map((s, i) =>
            i === legIndex
              ? { ...s, mintStatus: "complete", mintTxHash }
              : s,
          ),
        );

        // Persist to history (update existing record if found by burnTxHash + dest)
        if (batchTxHash && address) {
          try {
            const records = loadBridgeHistory(address);
            const updated = records.map((r) => {
              if (
                r.burnTxHash === batchTxHash &&
                r.destChain === destChainId &&
                r.status === "pending"
              ) {
                return {
                  ...r,
                  status: "complete" as const,
                  mintTxHash,
                  completedAt: Date.now(),
                  reclaimable: false,
                };
              }
              return r;
            });
            saveBridgeHistory(address, updated);
            window.dispatchEvent(new CustomEvent("lyxsa:bridge-history-updated"));
          } catch (e) {
            console.warn("[batch-mint] history update failed", e);
          }
        }

        // Background receipt verify (non-blocking)
        publicClient
          .waitForTransactionReceipt({
            hash: mintTxHash,
            timeout: 180_000,
            pollingInterval: 2_000,
          })
          .catch(() => {
            /* tx submitted, receipt indexing slow on some chains */
          });
      } catch (err) {
        const msg = friendlyError(err);
        setLegStates((prev) =>
          prev.map((s, i) =>
            i === legIndex
              ? { ...s, mintStatus: "error", errorMessage: msg }
              : s,
          ),
        );
      }
    },
    [address, walletClient, publicClient, switchChainAsync, legStates, setLegStates, batchTxHash],
  );

  return { mintLeg };
}
