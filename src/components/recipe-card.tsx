"use client";

/**
 * RecipeCard — single recipe display in the list view.
 *
 * Read-only display for Stage 2. Stage 3 will add edit/run actions.
 */

import { CHAIN_INFO } from "@/lib/wagmi";
import { Recipe, computeOutputAmount } from "@/lib/recipes-storage";

const SOLANA_DEVNET_ID = 999999001;

const SOLANA_INFO = {
  name: "Solana Devnet",
  logo: "◎",
  color: "#9945FF",
  type: "SVM" as const,
};

function getChainInfo(chainId: number) {
  if (chainId === SOLANA_DEVNET_ID) return SOLANA_INFO;
  return CHAIN_INFO[chainId];
}

function formatTime(ts?: number): string {
  if (!ts) return "Never run";
  const now = Date.now();
  const diff = now - ts;
  const min = Math.floor(diff / 60_000);
  const hour = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hour < 24) return `${hour}h ago`;
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface RecipeCardProps {
  recipe: Recipe;
  /** Stage 3+ wires these. Stage 2 ignores. */
  onRun?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function RecipeCard({
  recipe,
  onRun,
  onEdit,
  onDelete,
}: RecipeCardProps) {
  const sourceInfo = getChainInfo(recipe.sourceChainId);
  const lastRun = formatTime(recipe.lastRunAt);

  return (
    <div className="group relative rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-5 hover:border-white/[0.15] hover:bg-zinc-900/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-100 text-base truncate mb-1">
            {recipe.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="leading-none">
              {sourceInfo?.logo ?? "🌐"} {sourceInfo?.name ?? `Chain ${recipe.sourceChainId}`}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="leading-none">{recipe.totalAmount} USDC</span>
            <span className="text-zinc-700">·</span>
            <span className="leading-none text-zinc-500">
              {recipe.outputs.length} {recipe.outputs.length === 1 ? "output" : "outputs"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-zinc-500 shrink-0">
          {recipe.runCount && recipe.runCount > 0 ? (
            <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-semibold tracking-wider uppercase">
              {recipe.runCount}× run
            </span>
          ) : (
            <span className="px-2 py-1 rounded bg-zinc-800/60 text-zinc-500 font-semibold tracking-wider uppercase">
              New
            </span>
          )}
        </div>
      </div>

      {/* Outputs preview */}
      <div className="space-y-2 mb-4">
        {recipe.outputs.map((output, idx) => {
          const destInfo = getChainInfo(output.destChainId);
          const amount = computeOutputAmount(recipe.totalAmount, output.percentage);
          return (
            <div
              key={`${output.destChainId}_${idx}`}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="leading-none">
                  {destInfo?.logo ?? "🌐"}
                </span>
                <span className="text-zinc-300 truncate">
                  {destInfo?.name ?? `Chain ${output.destChainId}`}
                </span>
                {destInfo && "type" in destInfo && destInfo.type === "SVM" && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-bold tracking-wider uppercase leading-none">
                    SOL
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-zinc-400">{amount} USDC</span>
                <span className="text-zinc-500 tabular-nums w-12 text-right">
                  {output.percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — actions + meta */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
        <span className="text-[11px] text-zinc-500 tabular-nums leading-none">
          Last run · {lastRun}
        </span>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(recipe.id)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors leading-none"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(recipe.id)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors leading-none"
            >
              Delete
            </button>
          )}
          {onRun && (
            <button
              onClick={() => onRun(recipe.id)}
              className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all leading-none"
            >
              ▶ Run
            </button>
          )}
          {!onRun && !onEdit && !onDelete && (
            <span className="text-[10px] text-zinc-600 italic px-2 leading-none">
              Run actions enable in Stage 4
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
