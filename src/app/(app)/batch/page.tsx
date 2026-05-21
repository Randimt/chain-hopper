"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";

import { CHAIN_INFO, USDC_ADDRESSES } from "@/lib/wagmi";
import { ChainSelector } from "@/components/chain-selector";
import {
  BATCH_BRIDGE_SOURCE_CHAINS,
  MAX_BATCH_DESTINATIONS,
  isBatchBridgeSupported,
  getSplitterAddress,
} from "@/lib/lyxsa-splitter";
import { CCTP_DOMAINS } from "@/lib/cctp";
import { useBatchBridge, type BatchOutput } from "@/hooks/useBatchBridge";

/**
 * Phase 4 — Batch Bridge MVP
 * Fan-out splitter UI: 1 source → up to 5 EVM destinations in 1 atomic tx.
 */
export default function BatchPage() {
  const { address } = useAccount();
  const { state, approve, batchBurn, reset } = useBatchBridge();

  // ─────────────────────────────────────────────────────────────
  // Form state
  // ─────────────────────────────────────────────────────────────
  const [sourceChain, setSourceChain] = useState<number>(11155111); // Sepolia default
  const [outputs, setOutputs] = useState<OutputDraft[]>([
    { id: 1, destChainId: 84532, amountStr: "" }, // Base Sepolia
    { id: 2, destChainId: 421614, amountStr: "" }, // Arbitrum Sepolia
  ]);

  // Source USDC balance
  const usdcAddress = USDC_ADDRESSES[sourceChain];
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChain,
    query: { enabled: !!address && !!usdcAddress },
  });

  // Splitter allowance check
  const splitterAddr = getSplitterAddress(sourceChain);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && splitterAddr ? [address, splitterAddr] : undefined,
    chainId: sourceChain,
    query: { enabled: !!address && !!usdcAddress && !!splitterAddr },
  });

  // After approve confirms (state.status === "approved"), wagmi cache is stale.
  // Force refetch so the UI flips from "Approve" → "Bridge" button.
  useEffect(() => {
    if (state.status === "approved") {
      refetchAllowance();
      refetchBalance();
    }
  }, [state.status, refetchAllowance, refetchBalance]);

  // ─────────────────────────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────────────────────────
  const totalAmountRaw = useMemo(() => {
    return outputs.reduce((sum, out) => {
      try {
        return sum + parseUnits(out.amountStr || "0", 6);
      } catch {
        return sum;
      }
    }, 0n);
  }, [outputs]);

  const balanceRaw = balance ?? 0n;
  const balanceStr = balance ? formatUnits(balance, 6) : "0";
  const totalStr = formatUnits(totalAmountRaw, 6);

  const insufficientBalance = totalAmountRaw > balanceRaw;
  const allLegsValid =
    outputs.length > 0 &&
    outputs.every(
      (o) => o.amountStr !== "" && parseFloat(o.amountStr) > 0 && CCTP_DOMAINS[o.destChainId] !== undefined,
    );

  const needsApprove = !allowance || allowance < totalAmountRaw;
  const sourceSupported = isBatchBridgeSupported(sourceChain);

  // ─────────────────────────────────────────────────────────────
  // Form lock — prevent editing source/outputs once batch tx is in flight
  // or has burned (until user explicitly resets). Approve is reversible
  // (user can re-approve different amount), so we only lock from "burning"
  // onwards.
  // ─────────────────────────────────────────────────────────────
  const formLocked =
    state.status === "burning" || state.status === "burned";

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────
  const addOutput = () => {
    if (outputs.length >= MAX_BATCH_DESTINATIONS) return;
    const usedChains = new Set(outputs.map((o) => o.destChainId));
    usedChains.add(sourceChain);
    const nextChain =
      BATCH_BRIDGE_SOURCE_CHAINS.find((c) => !usedChains.has(c)) ?? 11155111;
    setOutputs([
      ...outputs,
      { id: Date.now(), destChainId: nextChain, amountStr: "" },
    ]);
  };

  const removeOutput = (id: number) => {
    setOutputs(outputs.filter((o) => o.id !== id));
  };

  const updateOutput = (id: number, patch: Partial<OutputDraft>) => {
    setOutputs(outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const handleApprove = () => {
    if (!sourceSupported || !address) return;
    approve(sourceChain, totalAmountRaw);
  };

  const handleBatchBurn = () => {
    if (!sourceSupported || !address) return;
    const validOutputs: BatchOutput[] = outputs
      .filter((o) => CCTP_DOMAINS[o.destChainId] !== undefined && o.amountStr)
      .map((o) => ({
        destChainId: o.destChainId,
        amountRaw: parseUnits(o.amountStr, 6),
        recipient: address as Address, // self-bridge (mvp; can extend to custom recipient)
      }));
    batchBurn({ sourceChain, outputs: validOutputs, totalAmountRaw });
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold">Batch Bridge</h1>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase">
              Beta
            </span>
          </div>
          <p className="text-zinc-500 text-sm">
            Fan-out splitter — 1 USDC source, up to {MAX_BATCH_DESTINATIONS} chains, 1 batch tx.
          </p>
        </div>
        <Link
          href="/recipes"
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Use Recipes (sequential queue) →
        </Link>
      </header>

      {/* SOURCE */}
      <section
        className={`bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 mb-4 ${formLocked ? "opacity-60 pointer-events-none" : ""}`}
        aria-disabled={formLocked}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">
            // source
          </div>
          {formLocked && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono uppercase tracking-wider">
              Locked · batch in flight
            </span>
          )}
        </div>
        <BatchSourcePicker value={sourceChain} onChange={setSourceChain} />
        {!sourceSupported && (
          <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            ⚠️ LyxsaSplitter not deployed on this chain yet. Currently live on:
            Sepolia, Base Sepolia, Arbitrum Sepolia, Arc Testnet.
          </div>
        )}
        <div className="mt-2 text-xs text-zinc-500">
          USDC balance: <span className="text-zinc-300 font-mono">{balanceStr}</span>
        </div>
      </section>

      {/* OUTPUTS */}
      <section
        className={`bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 mb-4 ${formLocked ? "opacity-60 pointer-events-none" : ""}`}
        aria-disabled={formLocked}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">
            // destinations ({outputs.length}/{MAX_BATCH_DESTINATIONS})
          </div>
          <button
            type="button"
            onClick={addOutput}
            disabled={outputs.length >= MAX_BATCH_DESTINATIONS || formLocked}
            className="text-xs px-3 py-1 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            + Add destination
          </button>
        </div>

        <div className="space-y-3">
          {outputs.map((out) => (
            <OutputRow
              key={out.id}
              draft={out}
              excludeChain={sourceChain}
              canRemove={outputs.length > 1 && !formLocked}
              onUpdate={(patch) => updateOutput(out.id, patch)}
              onRemove={() => removeOutput(out.id)}
            />
          ))}
        </div>
      </section>

      {/* SUMMARY */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-3 text-zinc-500">
          // summary
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-zinc-400">Total to bridge</div>
          <div className="text-right font-mono text-zinc-200">{totalStr} USDC</div>
          <div className="text-zinc-400">Destinations</div>
          <div className="text-right font-mono text-zinc-200">{outputs.length}</div>
          <div className="text-zinc-400">Splitter contract</div>
          <div className="text-right font-mono text-[11px] text-zinc-500 truncate">
            {splitterAddr ?? "n/a"}
          </div>
        </div>
        {insufficientBalance && (
          <div className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
            Total exceeds balance. Reduce amounts.
          </div>
        )}
      </section>

      {/* ACTION */}
      <section className="space-y-2">
        {needsApprove ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={
              !address ||
              !sourceSupported ||
              !allLegsValid ||
              insufficientBalance ||
              state.status === "approving"
            }
            className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:-translate-y-px hover:shadow-lg hover:shadow-amber-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {state.status === "approving"
              ? "Approving..."
              : `Approve ${totalStr || "0"} USDC for Batch Splitter`}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleBatchBurn}
            disabled={
              !address ||
              !sourceSupported ||
              !allLegsValid ||
              insufficientBalance ||
              state.status === "burning"
            }
            className="w-full h-11 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {state.status === "burning"
              ? "Submitting batch..."
              : `Bridge ${totalStr || "0"} USDC to ${outputs.length} chains`}
          </button>
        )}

        {/* STATE FEEDBACK */}
        {state.status === "approved" && (
          <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            ✓ Approved. Click bridge button to execute batch.
          </div>
        )}
        {state.status === "burned" && (
          <div className="text-xs bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 space-y-2">
            <div className="font-semibold text-cyan-300">
              ✓ Batch submitted! {state.legs.length} burns broadcast.
            </div>
            <div className="text-zinc-400 font-mono text-[11px] truncate">
              tx: {state.batchTxHash}
            </div>
            <div className="text-zinc-300 mt-2">
              <strong className="text-amber-300">Saved {state.recordIds.length} records to History as Reclaimable.</strong>
              {" "}USDC will arrive at destinations via CCTP V2 attestation flow (~30s per leg).
            </div>
            <div className="text-zinc-500 mt-1">
              Stage 8 will add automated mint UX. For now, claim each output via{" "}
              <Link href="/history" className="text-cyan-400 hover:text-cyan-300 underline">
                /history
              </Link>{" "}
              once attestation is ready.
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-cyan-400 hover:text-cyan-300 mt-2"
            >
              Start new batch →
            </button>
          </div>
        )}
        {state.status === "error" && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            <div className="font-semibold mb-1">Error</div>
            <div>{state.errorMessage}</div>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-rose-300 hover:text-rose-200 mt-2 underline"
            >
              dismiss
            </button>
          </div>
        )}
      </section>

      <div className="mt-8 text-xs text-zinc-600 text-center">
        Phase 4 Beta · LyxsaSplitter deployed on 4 testnets · Stage 7/9
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

type OutputDraft = {
  id: number;
  destChainId: number;
  amountStr: string;
};

/**
 * Source picker filtered to chains where LyxsaSplitter is actually deployed.
 * Saran user: only show chains with active contracts to avoid confusion.
 */
function BatchSourcePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (chainId: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
        From
      </label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-white/10 text-sm text-zinc-200 focus:border-cyan-500/40 focus:outline-none"
      >
        {BATCH_BRIDGE_SOURCE_CHAINS.map((id) => {
          const info = CHAIN_INFO[id];
          return (
            <option key={id} value={id}>
              {info?.name ?? `Chain ${id}`} (Splitter live)
            </option>
          );
        })}
      </select>
      <div className="text-[11px] text-zinc-600">
        4 chains active · Phase 4 expanding to 22 EVM testnets
      </div>
    </div>
  );
}

function OutputRow({
  draft,
  excludeChain,
  canRemove,
  onUpdate,
  onRemove,
}: {
  draft: OutputDraft;
  excludeChain: number;
  canRemove: boolean;
  onUpdate: (patch: Partial<OutputDraft>) => void;
  onRemove: () => void;
}) {
  const chainInfo = CHAIN_INFO[draft.destChainId];
  const supported = CCTP_DOMAINS[draft.destChainId] !== undefined;
  return (
    <div className="bg-black/30 border border-white/5 rounded-lg p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
      <div className="flex-1 w-full">
        <ChainSelector
          value={draft.destChainId}
          onChange={(id) => onUpdate({ destChainId: id })}
          exclude={excludeChain}
          label="To"
        />
        {!supported && chainInfo && (
          <div className="mt-1 text-[11px] text-amber-400">
            No CCTP V2 domain — pick a CCTP-supported chain.
          </div>
        )}
      </div>
      <div className="w-full sm:w-40">
        <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium block mb-1">
          Amount
        </label>
        <input
          type="text"
          value={draft.amountStr}
          onChange={(e) => onUpdate({ amountStr: e.target.value })}
          placeholder="0.0"
          inputMode="decimal"
          className="w-full h-9 px-3 rounded-md bg-zinc-950 border border-white/10 text-sm font-mono text-zinc-200 focus:border-cyan-500/40 focus:outline-none"
        />
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove output"
          className="h-9 w-9 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center"
        >
          ×
        </button>
      )}
    </div>
  );
}
