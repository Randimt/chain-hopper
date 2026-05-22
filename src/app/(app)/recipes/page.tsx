"use client";

/**
 * /recipes — Recipe list page (Stage 6 polish)
 *
 * Stage 2: read-only list + templates
 * Stage 3: + New button enabled, edit/delete wired, template "Use" wired
 * Stage 4: Run actions wired for single-output recipes (URL prefill)
 * Stage 5: Multi-output sequential queue + auto-advance
 * Stage 6 (current): Resume banner + analytics card
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRecipes } from "@/hooks/useRecipes";
import { RecipeCard } from "@/components/recipe-card";
import { CHAIN_INFO } from "@/lib/wagmi";
import {
  RECIPE_TEMPLATES,
  computeOutputAmount,
  saveRecipeQueue,
  clearRecipeQueue,
  loadRecipeQueue,
  isQueueComplete,
  type Recipe,
  type RecipeQueueState,
} from "@/lib/recipes-storage";

const SOLANA_DEVNET_ID = 999999001;

const SOLANA_INFO = {
  name: "Solana Devnet",
  logo: "◎",
  type: "SVM" as const,
};

function getChainInfo(chainId: number) {
  if (chainId === SOLANA_DEVNET_ID) return SOLANA_INFO;
  return CHAIN_INFO[chainId];
}

export default function RecipesPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { recipes, loading, removeRecipe } = useRecipes();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [runTarget, setRunTarget] = useState<Recipe | null>(null);
  const [activeQueue, setActiveQueue] = useState<RecipeQueueState | null>(null);
  const [cancelQueueOpen, setCancelQueueOpen] = useState(false);

  // Detect active queue on mount + when address changes
  useEffect(() => {
    if (!address) {
      setActiveQueue(null);
      return;
    }
    const queue = loadRecipeQueue(address);
    if (queue && !isQueueComplete(queue)) {
      setActiveQueue(queue);
    } else {
      setActiveQueue(null);
    }
  }, [address, recipes]);

  // Recipe analytics — compute aggregates for stats card
  const analytics = useMemo(() => {
    if (recipes.length === 0) return null;
    const totalRuns = recipes.reduce((sum, r) => sum + (r.runCount || 0), 0);
    const mostUsed = [...recipes]
      .filter((r) => (r.runCount || 0) > 0)
      .sort((a, b) => (b.runCount || 0) - (a.runCount || 0))[0];
    const lastRunRecipe = [...recipes]
      .filter((r) => r.lastRunAt)
      .sort((a, b) => (b.lastRunAt || 0) - (a.lastRunAt || 0))[0];
    return {
      totalRecipes: recipes.length,
      totalRuns,
      mostUsed,
      lastRunRecipe,
    };
  }, [recipes]);

  const handleEdit = (id: string) => {
    router.push(`/recipes/${id}/edit`);
  };

  const handleDeleteClick = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (recipe) setDeleteTarget({ id, name: recipe.name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeRecipe(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Phase 4: recipes execute via /batch (atomic batch through LyxsaSplitter).
  // /batch?fromRecipe=<id> reads the recipe from localStorage and pre-fills
  // the form with source + outputs + computed amounts.
  const buildBatchUrl = (recipeId: string): string => {
    return `/batch?fromRecipe=${encodeURIComponent(recipeId)}`;
  };

  const startQueue = (recipe: Recipe) => {
    if (!address) return;
    // Clear any stale queue first (legacy single-tx queue from Phase 3)
    clearRecipeQueue(address);
    // Phase 4: persist queue snapshot for backwards compat (history grouping
    // can still tie batch records back to a recipe), then redirect to /batch.
    const queue: RecipeQueueState = {
      recipeId: recipe.id,
      recipeName: recipe.name,
      sourceChainId: recipe.sourceChainId,
      outputs: recipe.outputs.map((o) => ({
        destChainId: o.destChainId,
        amount: computeOutputAmount(recipe.totalAmount, o.percentage),
        percentage: o.percentage,
      })),
      currentIndex: 0,
      completedIndices: [],
      skippedIndices: [],
      startedAt: Date.now(),
    };
    saveRecipeQueue(address, queue);
    router.push(buildBatchUrl(recipe.id));
  };

  const handleRun = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    // Phase 4: ALL recipes (single or multi-output) route to /batch.
    // Single-output recipes still benefit from atomic-batch UX (FAST attestation,
    // form lock, recovery hub integration) and stay consistent with multi-output.
    startQueue(recipe);
  };

  const confirmMultiRun = () => {
    if (!runTarget) return;
    startQueue(runTarget);
    setRunTarget(null);
  };

  // Resume active queue — redirect back to /batch with the recipe id.
  // Active queue state in localStorage tells /batch which legs are still
  // pending if user navigated away mid-mint.
  const resumeQueue = () => {
    if (!activeQueue) return;
    router.push(buildBatchUrl(activeQueue.recipeId));
  };

  // Cancel active queue — wipe localStorage + close modal
  const confirmCancelQueue = () => {
    if (!address) return;
    clearRecipeQueue(address);
    setActiveQueue(null);
    setCancelQueueOpen(false);
  };

  // Format relative time for analytics
  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return `${Math.floor(diff / 604800000)}w ago`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100">
              Recipes
            </h1>
            <span className="px-2 py-1 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase leading-none">
              Beta
            </span>
          </div>
          <p className="text-sm text-zinc-400 max-w-xl">
            Save bridge configurations as reusable presets. Multi-output
            sequential queues with skip/cancel and refresh-safe resume.
          </p>
        </div>

        <Link
          href="/recipes/new"
          className="h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center gap-2 hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
        >
          + New Recipe
        </Link>
      </div>

      {/* Active queue resume banner — Stage 6 polish */}
      {isConnected && activeQueue && (
        <div className="mb-6 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/[0.08] to-cyan-500/[0.05] p-4 sm:p-5">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-xl shrink-0">
              🍳
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="font-semibold text-zinc-100 text-sm">
                  Active recipe queue
                </p>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase leading-none">
                  In progress
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                <span className="font-medium text-zinc-200">
                  {activeQueue.recipeName}
                </span>
                {" · "}
                {activeQueue.completedIndices.length} of{" "}
                {activeQueue.outputs.length} outputs complete
                {activeQueue.skippedIndices.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-zinc-500">
                      {activeQueue.skippedIndices.length} skipped
                    </span>
                  </>
                )}
              </p>

              {/* Progress dots */}
              <div className="flex items-center gap-1 mb-3">
                {activeQueue.outputs.map((_, idx) => {
                  const isCompleted = activeQueue.completedIndices.includes(idx);
                  const isSkipped = activeQueue.skippedIndices.includes(idx);
                  const isCurrent = idx === activeQueue.currentIndex;
                  return (
                    <span
                      key={idx}
                      className={`h-2 w-2 rounded-full ${
                        isCompleted
                          ? "bg-emerald-500"
                          : isSkipped
                            ? "bg-zinc-600"
                            : isCurrent
                              ? "bg-purple-400 animate-pulse"
                              : "bg-zinc-700"
                      }`}
                      aria-label={`Output ${idx + 1}: ${
                        isCompleted
                          ? "completed"
                          : isSkipped
                            ? "skipped"
                            : isCurrent
                              ? "current"
                              : "pending"
                      }`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={resumeQueue}
                  className="h-8 px-3 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 text-white text-xs font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                >
                  ▶ Resume queue
                </button>
                <button
                  onClick={() => setCancelQueueOpen(true)}
                  className="h-8 px-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] text-rose-300 text-xs font-medium hover:bg-rose-500/[0.12] transition-colors"
                >
                  ✕ Cancel queue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics summary card — Stage 6 polish */}
      {isConnected && analytics && analytics.totalRuns > 0 && (
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-xl shrink-0">
              📊
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider">
                Your recipes
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-zinc-100 tabular-nums leading-none">
                    {analytics.totalRecipes}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {analytics.totalRecipes === 1 ? "recipe saved" : "recipes saved"}
                  </div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-zinc-100 tabular-nums leading-none">
                    {analytics.totalRuns}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">
                    {analytics.totalRuns === 1 ? "total run" : "total runs"}
                  </div>
                </div>
                {analytics.mostUsed && (
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 truncate">
                      {analytics.mostUsed.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      most used · {analytics.mostUsed.runCount}×
                    </div>
                  </div>
                )}
                {analytics.lastRunRecipe?.lastRunAt && (
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 truncate">
                      {formatRelativeTime(analytics.lastRunRecipe.lastRunAt)}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                      last · {analytics.lastRunRecipe.name}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-2xl">
            🔌
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            Connect wallet to view recipes
          </h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            Recipes are stored per wallet address. Connect to see your saved
            presets.
          </p>
          <button
            onClick={() => openConnectModal?.()}
            className="h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Loading state */}
      {isConnected && loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-5 animate-pulse"
            >
              <div className="h-4 w-32 bg-white/[0.05] rounded mb-3" />
              <div className="h-3 w-64 bg-white/[0.04] rounded mb-4" />
              <div className="space-y-2">
                <div className="h-3 bg-white/[0.04] rounded" />
                <div className="h-3 bg-white/[0.04] rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state with templates */}
      {isConnected && !loading && recipes.length === 0 && (
        <div className="space-y-8">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-10 text-center overflow-hidden relative">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.03] via-transparent to-pink-500/[0.03] pointer-events-none" />
            <div className="relative">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-3xl animate-pulse">
                🍳
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">
                No recipes yet
              </h3>
              <p className="text-sm text-zinc-500 mb-6 max-w-lg mx-auto leading-relaxed">
                Save bridge configs as reusable presets — multi-output, cross-VM,
                refresh-safe queue. One click to save, one click to re-run forever.
              </p>
              <Link
                href="/recipes/new"
                className="inline-block h-10 leading-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Create Your First Recipe
              </Link>
              <p className="text-[11px] text-zinc-600 mt-4">
                or pick a template below ↓
              </p>
            </div>
          </div>

          {/* Template gallery */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-200">
                  Suggested Recipes
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Templates to start from. Click &ldquo;Use template&rdquo; to
                  prefill the form.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RECIPE_TEMPLATES.map((template) => {
                const sourceInfo = getChainInfo(template.sourceChainId);
                return (
                  <div
                    key={template.id}
                    className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-5 hover:border-white/[0.12] transition-colors flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase leading-none">
                        Template
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {template.outputs.length} outputs
                      </span>
                    </div>
                    <h3 className="font-semibold text-zinc-100 text-sm mb-1.5">
                      {template.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                      {template.description}
                    </p>

                    <div className="text-[11px] text-zinc-500 mb-2.5 flex items-center gap-1.5">
                      <span>{sourceInfo?.logo ?? "🌐"}</span>
                      <span>From {sourceInfo?.name}</span>
                      <span className="text-zinc-700">·</span>
                      <span>{template.totalAmountSuggestion} USDC</span>
                    </div>

                    <div className="space-y-1.5 pt-2.5 border-t border-white/[0.04] flex-1">
                      {template.outputs.map((out, idx) => {
                        const info = getChainInfo(out.destChainId);
                        const amount = computeOutputAmount(
                          template.totalAmountSuggestion,
                          out.percentage
                        );
                        return (
                          <div
                            key={`${out.destChainId}_${idx}`}
                            className="flex items-center justify-between text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 text-zinc-300">
                              <span>{info?.logo ?? "🌐"}</span>
                              <span className="truncate">{info?.name}</span>
                            </span>
                            <span className="font-mono text-zinc-500 tabular-nums shrink-0">
                              {amount} ({out.percentage}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <Link
                      href={`/recipes/new?template=${template.id}`}
                      className="mt-4 h-9 leading-9 text-center rounded-lg border border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-300 text-xs font-semibold hover:bg-cyan-500/[0.12] transition-colors"
                    >
                      Use template →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recipes list */}
      {isConnected && !loading && recipes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2 px-1">
            <span>
              {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            </span>
            <span>Newest first</span>
          </div>
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onRun={handleRun}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* Stage progress hint */}
      <div className="mt-12 pt-8 border-t border-white/[0.06]">
        <div className="rounded-xl bg-zinc-950/40 border border-white/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-sm shrink-0">
              📋
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-300 mb-1">
                Phase 3 Recipes — Shipped (Beta)
              </p>
              <ul className="text-[11px] text-zinc-500 space-y-0.5 leading-relaxed">
                <li>✓ Stage 1 · Foundation (storage, validation, hook)</li>
                <li>✓ Stage 2 · List page</li>
                <li>✓ Stage 3 · Create &amp; edit form</li>
                <li>✓ Stage 4 · Single-output execution</li>
                <li>✓ Stage 5 · Multi-output sequential queue</li>
                <li>
                  ✓ Stage 6 · Polish — resume banner, analytics, history tagging,
                  mobile responsive, recruiter-tier
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-output run modal — Stage 5 sequential queue flow */}
      {runTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setRunTarget(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-purple-500/10 flex items-center justify-center text-2xl">
              🍳
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 text-center mb-2">
              Run multi-output recipe
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-1">
              <span className="font-medium text-zinc-300">
                &ldquo;{runTarget.name}&rdquo;
              </span>{" "}
              has{" "}
              <span className="font-semibold text-zinc-200">
                {runTarget.outputs.length} outputs
              </span>
              .
            </p>
            <p className="text-sm text-zinc-500 text-center mb-5">
              Outputs run{" "}
              <span className="font-medium text-zinc-300">sequentially</span>.
              You&apos;ll bridge each one in turn — sign in your wallet, wait
              for confirmation, then advance to the next.
            </p>

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 mb-5">
              <p className="text-[11px] text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
                Execution order
              </p>
              <div className="space-y-1.5">
                {runTarget.outputs.map((output, idx) => {
                  const amount = computeOutputAmount(
                    runTarget.totalAmount,
                    output.percentage
                  );
                  const sourceInfo = getChainInfo(runTarget.sourceChainId);
                  const destInfo = getChainInfo(output.destChainId);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <span className="text-zinc-600 font-mono w-5">
                          {idx + 1}.
                        </span>
                        <span>{sourceInfo?.logo ?? "🌐"}</span>
                        <span className="text-zinc-500">
                          {sourceInfo?.name}
                        </span>
                        <span className="text-zinc-600">→</span>
                        <span>{destInfo?.logo ?? "🌐"}</span>
                        <span>{destInfo?.name}</span>
                      </span>
                      <span className="font-mono text-zinc-200">
                        {amount} USDC
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setRunTarget(null)}
                className="h-10 px-5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmMultiRun}
                className="h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Start Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-rose-500/10 flex items-center justify-center text-2xl">
              ⚠
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 text-center mb-2">
              Delete recipe?
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-6">
              <span className="font-medium text-zinc-300">
                &ldquo;{deleteTarget.name}&rdquo;
              </span>{" "}
              will be removed. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="h-10 px-5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="h-10 px-5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
              >
                Delete Recipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel queue confirm modal — Stage 6 polish */}
      {cancelQueueOpen && activeQueue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setCancelQueueOpen(false)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-rose-500/10 flex items-center justify-center text-2xl">
              ⚠
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 text-center mb-2">
              Cancel queue?
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-1">
              <span className="font-medium text-zinc-300">
                &ldquo;{activeQueue.recipeName}&rdquo;
              </span>{" "}
              will stop executing.
            </p>
            <p className="text-sm text-zinc-500 text-center mb-6">
              {activeQueue.completedIndices.length} of{" "}
              {activeQueue.outputs.length} outputs already complete will stay
              bridged. Remaining outputs will be skipped.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelQueueOpen(false)}
                className="h-10 px-5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={confirmCancelQueue}
                className="h-10 px-5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
              >
                Cancel queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
