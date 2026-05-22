"use client";

/**
 * RecipeOutputRow — single output row in recipe form.
 *
 * Composed: ChainSelector (dest) + percentage input + computed amount + remove button.
 *
 * Phase 4 mode: destinations restricted to EVM chains supported by Circle's
 * CCTP V2 protocol (22 testnets). Solana destinations paused — recipe execution
 * routes through LyxsaSplitter which is EVM-only. Cross-VM batch returns in
 * Phase 5 alongside App Kits SDK migration.
 */

import { ChainSelector } from "@/components/chain-selector";
import { computeOutputAmount } from "@/lib/recipes-storage";
import type { RecipeOutput } from "@/lib/recipes-storage";

interface RecipeOutputRowProps {
  index: number;
  output: RecipeOutput;
  totalAmount: string;
  sourceChainId: number;
  onChange: (index: number, output: RecipeOutput) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  /** Other dest chain IDs already used in form — exclude from this row's selector. */
  excludeChainIds: number[];
}

export function RecipeOutputRow({
  index,
  output,
  totalAmount,
  sourceChainId,
  onChange,
  onRemove,
  canRemove,
  excludeChainIds,
}: RecipeOutputRowProps) {
  const amount = computeOutputAmount(totalAmount || "0", output.percentage);

  // ChainSelector exclude prop only takes single chainId — we'll filter in custom logic
  // by passing source as exclude (most important constraint)
  const handleChainChange = (chainId: number) => {
    if (excludeChainIds.includes(chainId)) return; // block duplicate dest
    onChange(index, { ...output, destChainId: chainId });
  };

  const handlePctChange = (raw: string) => {
    // Clamp 0-100, allow empty during typing
    const num = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(num)) return;
    const clamped = Math.max(0, Math.min(100, num));
    onChange(index, { ...output, percentage: clamped });
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          Output {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded transition-colors leading-none"
          >
            ✕ Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px] gap-3 items-end">
        {/* Destination chain — EVM only (LyxsaSplitter constraint) */}
        <div>
          <ChainSelector
            value={output.destChainId}
            onChange={handleChainChange}
            exclude={sourceChainId}
            label="Destination"
          />
        </div>

        {/* Percentage input */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
            Percentage
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={output.percentage}
              onChange={(e) => handlePctChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 pl-3 pr-7 py-3 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">
              %
            </span>
          </div>
        </div>

        {/* Computed amount (read-only) */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
            Amount
          </label>
          <div className="rounded-lg border border-zinc-900 bg-zinc-950/60 px-3 py-3 text-sm font-mono text-zinc-300 tabular-nums truncate">
            {amount}
          </div>
        </div>
      </div>

      {/* Duplicate warning inline */}
      {excludeChainIds.includes(output.destChainId) && (
        <p className="mt-2 text-[11px] text-amber-400">
          ⚠ Same destination used in another output — pick a different chain
        </p>
      )}
    </div>
  );
}
