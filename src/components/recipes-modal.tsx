"use client";

/**
 * RecipesModal — embedded recipe picker for /batch page.
 *
 * Replaces standalone /recipes page in nav (Opsi C from May 24 mockup).
 * Lets user browse + pick a saved recipe without leaving the batch flow.
 *
 * Data source: useRecipes() hook (same as /recipes page — single source of truth).
 *
 * Pick flow:
 *   1. User clicks "Load Recipe" button on /batch page
 *   2. Modal opens, lists recipes (newest first)
 *   3. User clicks "Use →" on a recipe
 *   4. Modal calls onPick(recipeId) which navigates to /batch?fromRecipeId=<id>
 *      (existing URL contract — batch page already prefills form from this)
 *
 * Other actions stay on dedicated pages (no inline edit/delete to keep modal small):
 *   - "Edit" → /recipes/[id]/edit
 *   - "+ Create new recipe" → /recipes/new
 *   - "Manage all recipes" link → /recipes
 *
 * Routes /recipes, /recipes/new, /recipes/[id]/edit remain mounted so existing
 * bookmarks + edit/create flows keep working — only the nav entry is removed.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRecipes } from "@/hooks/useRecipes";
import { CHAIN_INFO } from "@/lib/wagmi";
import type { Recipe } from "@/lib/recipes-storage";

const SOLANA_DEVNET_ID = 999999001;

function getChainName(chainId: number): string {
  if (chainId === SOLANA_DEVNET_ID) return "Solana Devnet";
  return CHAIN_INFO[chainId]?.name ?? `Chain ${chainId}`;
}

function summarizeRecipe(recipe: Recipe): string {
  const source = getChainName(recipe.sourceChainId);
  const targets = recipe.outputs
    .slice(0, 4)
    .map((o) => `${getChainName(o.chainId)} ${o.percentage}%`)
    .join(", ");
  const more =
    recipe.outputs.length > 4 ? ` +${recipe.outputs.length - 4} more` : "";
  return `${source} → ${targets}${more}`;
}

function formatRelative(timestamp?: number): string {
  if (!timestamp) return "never used";
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

interface RecipesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RecipesModal({ open, onClose }: RecipesModalProps) {
  const router = useRouter();
  const { recipes, loading } = useRecipes();

  // Sort newest-first by lastRunAt then updatedAt
  const sorted = useMemo(() => {
    return [...recipes].sort((a, b) => {
      const aRecent = a.lastRunAt ?? a.updatedAt;
      const bRecent = b.lastRunAt ?? b.updatedAt;
      return bRecent - aRecent;
    });
  }, [recipes]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (recipeId: string) => {
    onClose();
    router.push(`/batch?fromRecipeId=${recipeId}`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Recipes picker"
    >
      <div className="w-full max-w-xl max-h-[80vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-zinc-100">My Recipes</h2>
            {sorted.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
                {sorted.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Loading recipes...
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-sm font-semibold text-zinc-300 mb-1">
                No recipes yet
              </div>
              <div className="text-xs text-zinc-500 mb-5 max-w-sm mx-auto">
                Save batch configurations as recipes for quick re-use across
                multichain distributions.
              </div>
              <Link
                href="/recipes/new"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                + Create your first recipe
              </Link>
            </div>
          ) : (
            sorted.map((recipe) => (
              <div
                key={recipe.id}
                className="p-4 rounded-xl bg-white/[0.02] border border-zinc-800 hover:border-cyan-500/30 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-base shrink-0">🌐</span>
                    <h3 className="font-semibold text-zinc-100 text-sm truncate">
                      {recipe.name}
                    </h3>
                  </div>
                  {recipe.runCount && recipe.runCount > 0 ? (
                    <span className="shrink-0 text-[10px] text-zinc-500 font-mono">
                      {recipe.runCount}× run
                    </span>
                  ) : null}
                </div>

                <div className="text-xs text-zinc-400 mb-1.5 leading-relaxed">
                  {summarizeRecipe(recipe)}
                </div>

                <div className="text-[10px] text-zinc-500 mb-3 font-mono">
                  {recipe.totalAmount} USDC · last run {formatRelative(recipe.lastRunAt)}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePick(recipe.id)}
                    className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-semibold hover:-translate-y-px hover:shadow-md hover:shadow-cyan-500/20 transition-all"
                  >
                    Use →
                  </button>
                  <Link
                    href={`/recipes/${recipe.id}/edit`}
                    onClick={onClose}
                    className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 text-xs font-medium transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {sorted.length > 0 && (
          <footer className="px-6 py-3 border-t border-zinc-800 flex items-center gap-2">
            <Link
              href="/recipes/new"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/5 border border-dashed border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 text-sm font-semibold transition-all"
            >
              + Create new recipe
            </Link>
            <Link
              href="/recipes"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 text-xs font-medium transition-colors"
            >
              Manage all
            </Link>
          </footer>
        )}
      </div>
    </div>
  );
}
