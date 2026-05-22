"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount, useReadContract, useChainId, useSwitchChain } from "wagmi";
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
import {
  useBatchAttestations,
  useBatchLegMint,
  type LegState,
} from "@/hooks/useBatchAttestations";
import {
  loadBridgeHistory,
  findBatchSiblings,
  type BridgeRecord,
} from "@/lib/bridge-history";
import {
  getRecipe,
  computeOutputAmount,
  type Recipe,
} from "@/lib/recipes-storage";

/**
 * Phase 4 — Batch Bridge MVP
 * Fan-out splitter UI: 1 source → up to 5 EVM destinations in 1 atomic tx.
 *
 * Approach C: Also serves as universal recovery hub when ?recover=<txHash>
 * is in the URL — re-mounts BatchProgress UI for previously-burned batch
 * records found in history.
 */
export default function BatchPage() {
  // Suspense wrapper required because useSearchParams() opts the route
  // into dynamic rendering on Next 15+.
  return (
    <Suspense fallback={<BatchPageSkeleton />}>
      <BatchPageInner />
    </Suspense>
  );
}

function BatchPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="h-8 w-48 bg-zinc-900/50 rounded animate-pulse mb-6" />
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
        Loading…
      </div>
    </div>
  );
}

function BatchPageInner() {
  const params = useSearchParams();
  const recoverTxHash = params.get("recover") as `0x${string}` | null;
  const fromRecipeId = params.get("fromRecipe");

  // Recovery mode short-circuits the create flow entirely.
  if (recoverTxHash) {
    return <BatchRecoveryView txHash={recoverTxHash} />;
  }

  // Recipe mode: load saved recipe + pre-fill the create form with its
  // source + outputs. Same UI as ad-hoc batch, just pre-populated.
  return <BatchCreateView fromRecipeId={fromRecipeId ?? undefined} />;
}

function BatchCreateView({ fromRecipeId }: { fromRecipeId?: string }) {
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

  // Recipe-driven mode: pre-fill source + outputs from saved recipe.
  // Runs once per (recipe, wallet) — user can still edit after load.
  const [recipeMeta, setRecipeMeta] = useState<{
    id: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!fromRecipeId || !address) return;
    const recipe = getRecipe(address, fromRecipeId);
    if (!recipe) return;
    // Pre-fill form
    setSourceChain(recipe.sourceChainId);
    setOutputs(
      recipe.outputs.map((o, idx) => ({
        id: idx + 1,
        destChainId: o.destChainId,
        amountStr: computeOutputAmount(recipe.totalAmount, o.percentage),
      }))
    );
    setRecipeMeta({ id: recipe.id, name: recipe.name });
  }, [fromRecipeId, address]);

  // Detect wallet chain mismatch — wagmi's useReadContract returns "0x" when
  // wallet is on chain X but we query chain Y (USDC contract doesn't exist
  // at the same address on the wallet's current network).
  // Surface a switch-network prompt so user knows why allowance/balance fail.
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const chainMismatch = !!address && walletChainId !== sourceChain;

  // Source USDC balance
  const usdcAddress = USDC_ADDRESSES[sourceChain];
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChain,
    query: { enabled: !!address && !!usdcAddress && !chainMismatch },
  });

  // Splitter allowance check
  const splitterAddr = getSplitterAddress(sourceChain);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && splitterAddr ? [address, splitterAddr] : undefined,
    chainId: sourceChain,
    query: { enabled: !!address && !!usdcAddress && !!splitterAddr && !chainMismatch },
  });

  // After approve confirms (state.status === "approved"), wagmi cache is stale.
  // Force refetch so the UI flips from "Approve" → "Bridge" button.
  useEffect(() => {
    if (state.status === "approved") {
      refetchAllowance();
      refetchBalance();
    }
  }, [state.status, refetchAllowance, refetchBalance]);

  // Refetch balance + allowance after wallet network switch resolves.
  // Without this, queries stay stale because they were disabled while
  // chainMismatch was true.
  useEffect(() => {
    if (!chainMismatch && address && usdcAddress) {
      refetchBalance();
      refetchAllowance();
    }
  }, [chainMismatch, address, usdcAddress, refetchBalance, refetchAllowance]);

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
  // ─────────────────────────────────────────────────────────────
  // Bug B fix — Form lock during AND after batch (prevent double-bridge)
  // Form must stay locked while:
  //   (a) tx in flight ("burning")
  //   (b) batch awaiting attestation/mint ("burned")
  //   (c) error state where receipt hung but tx may have succeeded ("error"
  //       AND state.batchTxHash present — caller should reset explicitly)
  //
  // Phase 4 update: also UNLOCK when all legs minted (allLegsComplete).
  // After complete, user should be able to start a new batch without
  // clicking "Start new batch" first.
  // NOTE: allLegsComplete + formLocked declared AFTER legStates to avoid TDZ.
  // ─────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  // Stage 8: Multi-attestation tracking + per-leg mint
  // Pulls legs from state.legs after successful batchBurn,
  // polls Iris API in parallel, exposes per-leg mintLeg() handler.
  // ─────────────────────────────────────────────────────────────
  const burnedLegs =
    state.status === "burned"
      ? state.legs.map((l) => ({
          destChainId: l.destChainId,
          amountRaw: l.amountRaw,
          recipient: l.recipient,
        }))
      : [];

  const { legStates, setLegStates } = useBatchAttestations({
    sourceChain,
    batchTxHash: state.status === "burned" ? state.batchTxHash : undefined,
    legs: burnedLegs,
    enabled: state.status === "burned",
  });

  const { mintLeg } = useBatchLegMint(
    legStates,
    setLegStates,
    state.status === "burned" ? state.batchTxHash : undefined,
  );

  // ─────────────────────────────────────────────────────────────
  // Bug C — In-flight banner: warn user there's an active batch
  // (so they know to either continue mint or reset before bridging again)
  // MUST be declared AFTER legStates to avoid TDZ in production minify.
  // ─────────────────────────────────────────────────────────────
  const inFlightCount =
    state.status === "burned"
      ? legStates.filter((l) => l.mintStatus !== "complete").length
      : 0;
  const completedCount =
    state.status === "burned"
      ? legStates.filter((l) => l.mintStatus === "complete").length
      : 0;

  // Form lock semantics — declared after legStates to avoid TDZ.
  // Locked while:
  //   (a) tx in flight ("burning")
  //   (b) batch awaiting attestation/mint ("burned")
  // UNLOCKED when all legs minted (allLegsComplete) — user can immediately
  // start a new batch without clicking "Start new batch" first.
  const allLegsComplete =
    state.status === "burned" &&
    legStates.length > 0 &&
    legStates.every((l) => l.mintStatus === "complete");
  const formLocked =
    !allLegsComplete &&
    (state.status === "burning" || state.status === "burned");

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
            <h1 className="text-3xl font-bold">
              {recipeMeta ? "Run Recipe" : "Batch Bridge"}
            </h1>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase">
              Beta
            </span>
            {recipeMeta && (
              <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase">
                Recipe
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-sm">
            {recipeMeta
              ? `${recipeMeta.name} — pre-filled from your saved recipe. Edit before bridging if you want.`
              : `Fan-out splitter — 1 USDC source, up to ${MAX_BATCH_DESTINATIONS} chains, 1 batch tx.`}
          </p>
        </div>
        <Link
          href="/recipes"
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          {recipeMeta ? "← Back to Recipes" : "Browse Recipes →"}
        </Link>
      </header>

      {/* Chain mismatch banner — wallet on different network than form source */}
      {chainMismatch && (
        <div className="mb-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-3">
          <span className="text-cyan-400 text-lg leading-none mt-0.5">🔄</span>
          <div className="flex-1 text-sm">
            <div className="font-semibold text-cyan-200 mb-1">
              Wallet on different network
            </div>
            <div className="text-cyan-300/80 text-xs mb-2">
              Source is set to <span className="font-mono text-cyan-200">{CHAIN_INFO[sourceChain]?.name ?? `Chain ${sourceChain}`}</span> but
              your wallet is on <span className="font-mono text-cyan-200">{CHAIN_INFO[walletChainId]?.name ?? `Chain ${walletChainId}`}</span>.
              Switch to load balance and allowance.
            </div>
            <button
              onClick={() => switchChain({ chainId: sourceChain })}
              disabled={isSwitchingChain}
              className="px-3 py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 text-xs font-medium border border-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSwitchingChain
                ? "Switching..."
                : `Switch to ${CHAIN_INFO[sourceChain]?.name ?? `Chain ${sourceChain}`}`}
            </button>
          </div>
        </div>
      )}

      {/* In-flight banner — warn user batch is active */}
      {state.status === "burned" && inFlightCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <span className="text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-200 mb-1">
              Batch in flight — {completedCount}/{legStates.length} done · {inFlightCount} pending
            </div>
            <div className="text-amber-300/80 text-xs">
              Continue minting below, or click <span className="font-mono">Start new batch</span> to abandon
              this batch (legs remain reclaimable from /history).
            </div>
          </div>
        </div>
      )}

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
          <BatchProgress
            batchTxHash={state.batchTxHash}
            legStates={legStates}
            onMintLeg={mintLeg}
            onReset={reset}
          />
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
        Phase 4 LIVE · LyxsaSplitter deployed on 4 testnets · 25 tests · Slither clean
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
 * Stage 8 — Multi-attestation progress + per-leg mint UI.
 * Shows live polling state per leg, "Mint" button when attestation ready.
 */
function BatchProgress({
  batchTxHash,
  legStates,
  onMintLeg,
  onReset,
}: {
  batchTxHash: `0x${string}`;
  legStates: LegState[];
  onMintLeg: (legIndex: number) => void;
  onReset: () => void;
}) {
  const completeCount = legStates.filter((l) => l.mintStatus === "complete").length;
  const readyCount = legStates.filter((l) => l.mintStatus === "ready").length;
  const allComplete = completeCount === legStates.length && legStates.length > 0;

  return (
    <div className="text-xs bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-cyan-300">
          {allComplete
            ? `✓ All ${legStates.length} bridges complete`
            : `Batch in flight · ${completeCount}/${legStates.length} done · ${readyCount} ready to mint`}
        </div>
        <span className="text-[10px] font-mono text-zinc-500">
          {batchTxHash.slice(0, 8)}...{batchTxHash.slice(-6)}
        </span>
      </div>

      <div className="space-y-2">
        {legStates.map((leg) => (
          <LegRow key={leg.legIndex} leg={leg} onMint={() => onMintLeg(leg.legIndex)} />
        ))}
      </div>

      {allComplete && (
        <div className="pt-2 mt-2 border-t border-white/5 text-zinc-400">
          🎉 All {legStates.length} legs minted. USDC arrived on destination chains.
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="text-xs text-cyan-400 hover:text-cyan-300 underline"
      >
        Start new batch →
      </button>
    </div>
  );
}

/**
 * Single leg progress row — chain badge, status, optional mint button.
 */
function LegRow({ leg, onMint }: { leg: LegState; onMint: () => void }) {
  const chainName = CHAIN_INFO[leg.destChainId]?.name ?? `Chain ${leg.destChainId}`;
  const amount = (Number(leg.amountRaw) / 1_000_000).toString();

  let statusLabel: string;
  let statusColor: string;
  switch (leg.mintStatus) {
    case "pending":
      statusLabel = "Waiting attestation...";
      statusColor = "text-amber-400";
      break;
    case "ready":
      statusLabel = "Attestation ready";
      statusColor = "text-emerald-400";
      break;
    case "minting":
      statusLabel = "Minting...";
      statusColor = "text-cyan-400";
      break;
    case "complete":
      statusLabel = "✓ Complete";
      statusColor = "text-emerald-400";
      break;
    case "error":
      statusLabel = leg.errorMessage ?? "Error";
      statusColor = "text-rose-400";
      break;
  }

  return (
    <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-md px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-zinc-200">{chainName}</span>
          <span className="font-mono text-[11px] text-zinc-500">{amount} USDC</span>
        </div>
        <div className={`text-[11px] mt-0.5 ${statusColor}`}>{statusLabel}</div>
        {leg.mintTxHash && (
          <div className="text-[10px] font-mono text-zinc-600 mt-0.5 truncate">
            mint: {leg.mintTxHash.slice(0, 12)}...
          </div>
        )}
      </div>
      {leg.mintStatus === "ready" && (
        <button
          type="button"
          onClick={onMint}
          className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors font-semibold"
        >
          Mint
        </button>
      )}
      {leg.mintStatus === "error" && (
        <button
          type="button"
          onClick={onMint}
          className="text-xs px-3 py-1.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Recovery View (Approach C)
//
// Mounted when /batch?recover=<txHash> is hit. Loads matching records from
// localStorage, reconstructs legs[], and re-uses Stage 8 BatchProgress UI
// for attestation tracking + per-leg mint.
//
// Records that are already "complete" still render but with the Mint button
// suppressed (already-claimed legs show ✓ Complete).
// ─────────────────────────────────────────────────────────────────────────────
function BatchRecoveryView({ txHash }: { txHash: `0x${string}` }) {
  const router = useRouter();
  const { address } = useAccount();
  const [records, setRecords] = useState<BridgeRecord[] | null>(null);

  // Load records once wallet is connected
  useEffect(() => {
    if (!address) return;
    const all = loadBridgeHistory(address);
    const siblings = findBatchSiblings(txHash, all);
    setRecords(siblings);
  }, [address, txHash]);

  // Derive sourceChain + legs from records (records share sourceChain)
  const sourceChain = records && records.length > 0 ? records[0].sourceChain : 0;
  const legs = useMemo(() => {
    if (!records || !address) return [];
    return records.map((r) => ({
      destChainId: r.destChain,
      amountRaw: parseUnits(r.amount || "0", 6),
      recipient: address as Address,
    }));
  }, [records, address]);

  const enabled = !!records && records.length > 0 && !!sourceChain;

  const { legStates, setLegStates } = useBatchAttestations({
    sourceChain,
    batchTxHash: enabled ? txHash : undefined,
    legs,
    enabled,
  });

  const { mintLeg } = useBatchLegMint(legStates, setLegStates, txHash);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <RecoveryHeader />
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="text-zinc-400 text-sm mb-2">Connect wallet to recover</div>
          <div className="text-zinc-600 text-xs">
            Records are stored per wallet — connect the same wallet that started this batch.
          </div>
        </div>
      </div>
    );
  }

  if (records === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <RecoveryHeader />
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
          Loading batch records…
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <RecoveryHeader />
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="text-amber-400 text-sm mb-2">⚠️ No records found</div>
          <div className="text-zinc-500 text-xs mb-4">
            Tx <span className="font-mono">{txHash.slice(0, 10)}…{txHash.slice(-6)}</span> has
            no matching batch entries in this wallet&apos;s history.
          </div>
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="text-xs text-cyan-400 hover:text-cyan-300 underline"
          >
            ← Back to History
          </button>
        </div>
      </div>
    );
  }

  const sourceInfo = CHAIN_INFO[sourceChain];
  const totalAmount = records.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const completedCount = records.filter((r) => r.status === "complete").length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <RecoveryHeader />

      {/* Recovery context summary */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-3 text-zinc-500">
          // recovery context
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-zinc-400">Source</div>
          <div className="text-right font-mono text-zinc-200">
            {sourceInfo?.name ?? `Chain ${sourceChain}`}
          </div>
          <div className="text-zinc-400">Total burned</div>
          <div className="text-right font-mono text-zinc-200">{totalAmount} USDC</div>
          <div className="text-zinc-400">Legs</div>
          <div className="text-right font-mono text-zinc-200">
            {records.length} {completedCount > 0 && `(${completedCount} done)`}
          </div>
          <div className="text-zinc-400">Burn tx</div>
          <div className="text-right font-mono text-[11px] text-zinc-500 truncate">
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </div>
        </div>
      </section>

      {/* Reuse BatchProgress UI from Stage 8 */}
      <BatchProgress
        batchTxHash={txHash}
        legStates={legStates}
        onMintLeg={mintLeg}
        onReset={() => router.push("/history")}
      />

      <div className="mt-8 text-xs text-zinc-600 text-center">
        Recovery mode · Stage 8 attestation tracker
      </div>
    </div>
  );
}

function RecoveryHeader() {
  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl font-bold">Recover Batch</h1>
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-bold tracking-wider uppercase">
            Recovery
          </span>
        </div>
        <p className="text-zinc-500 text-sm">
          Resume attestation tracking and mint pending legs.
        </p>
      </div>
      <Link
        href="/history"
        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        ← Back to History
      </Link>
    </header>
  );
}
