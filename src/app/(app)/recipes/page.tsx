"use client";

/**
 * /recipes — Recipe list page (Stage 3 with full CRUD)
 *
 * Stage 2: read-only list + templates
 * Stage 3 (current): + New button enabled, edit/delete wired, template "Use" wired
 * Stage 4 will add: Run actions wired, run modal
 */

import { useState } from "react";
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
  type Recipe,
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
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { recipes, loading, removeRecipe } = useRecipes();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [runTarget, setRunTarget] = useState<Recipe | null>(null);

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

  const buildBridgeUrl = (recipe: Recipe, outputIdx: number = 0): string => {
    const output = recipe.outputs[outputIdx];
    const amount = computeOutputAmount(recipe.totalAmount, output.percentage);
    const params = new URLSearchParams({
      from: String(recipe.sourceChainId),
      to: String(output.destChainId),
      amount,
      recipeId: recipe.id,
      recipeName: recipe.name,
    });
    return `/bridge?${params.toString()}`;
  };

  const handleRun = (id: string) => {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    if (recipe.outputs.length === 1) {
      // Single output — direct redirect
      router.push(buildBridgeUrl(recipe, 0));
    } else {
      // Multi-output — show modal warning Stage 5 not ready, offer first output run
      setRunTarget(recipe);
    }
  };

  const confirmMultiRun = () => {
    if (!runTarget) return;
    const url = buildBridgeUrl(runTarget, 0);
    setRunTarget(null);
    router.push(url);
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
            execution arrives in Stage 5.
          </p>
        </div>

        <Link
          href="/recipes/new"
          className="h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold flex items-center gap-2 hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
        >
          + New Recipe
        </Link>
      </div>

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
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-3xl">
              🍳
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">
              No recipes yet
            </h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-lg mx-auto">
              A recipe saves a bridge configuration — source chain, total
              amount, and one or more destination outputs. Re-run anytime
              with a single click (coming Stage 4).
            </p>
            <Link
              href="/recipes/new"
              className="inline-block h-10 leading-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
            >
              Create Your First Recipe
            </Link>
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
                Phase 3 Recipes — Staged Rollout
              </p>
              <ul className="text-[11px] text-zinc-500 space-y-0.5 leading-relaxed">
                <li>✓ Stage 1 · Foundation (storage, validation, hook)</li>
                <li>✓ Stage 2 · List page</li>
                <li>✓ Stage 3 · Create &amp; edit form</li>
                <li>
                  <span className="text-purple-300">▶ Stage 4</span> ·
                  Single-output execution (you are here)
                </li>
                <li>· Stage 5 · Multi-output parallel</li>
                <li>· Stage 6 · Polish &amp; resilience</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-output run warning modal (Stage 5 not ready) */}
      {runTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setRunTarget(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-500/10 flex items-center justify-center text-2xl">
              🍳
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 text-center mb-2">
              Multi-output recipe
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
              Stage 4 runs the{" "}
              <span className="font-medium text-zinc-300">first output</span>{" "}
              only. Parallel multi-output execution arrives in Stage 5.
            </p>

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 mb-5">
              <p className="text-[11px] text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
                Will execute
              </p>
              {runTarget.outputs[0] && (() => {
                const firstOut = runTarget.outputs[0];
                const firstAmount = computeOutputAmount(
                  runTarget.totalAmount,
                  firstOut.percentage
                );
                const sourceInfo = getChainInfo(runTarget.sourceChainId);
                const destInfo = getChainInfo(firstOut.destChainId);
                return (
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span>{sourceInfo?.logo ?? "🌐"}</span>
                      <span>{sourceInfo?.name}</span>
                      <span className="text-zinc-600">→</span>
                      <span>{destInfo?.logo ?? "🌐"}</span>
                      <span>{destInfo?.name}</span>
                    </span>
                    <span className="font-mono text-zinc-200">
                      {firstAmount} USDC
                    </span>
                  </div>
                );
              })()}
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
                Run First Output
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
    </div>
  );
}
