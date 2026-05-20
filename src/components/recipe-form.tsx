"use client";

/**
 * RecipeForm — unified create/edit form.
 *
 * Modes:
 *   - mode="create": fresh form, "Save Recipe" button
 *   - mode="edit": prefilled with existing recipe
 *   - mode="from-template": prefilled from RecipeTemplate
 *
 * Validation runs on both blur + submit. Server-side validation
 * (validateRecipe) is the source of truth — UI just mirrors it.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import { ChainSelector } from "@/components/chain-selector";
import { RecipeOutputRow } from "@/components/recipe-output-row";
import { useRecipes } from "@/hooks/useRecipes";
import {
  type Recipe,
  type RecipeOutput,
  type RecipeTemplate,
  autoBalanceOutputs,
  validateRecipe,
} from "@/lib/recipes-storage";
import { USDC_ADDRESSES } from "@/lib/wagmi";

const MAX_OUTPUTS = 5;

interface RecipeFormProps {
  mode: "create" | "edit" | "from-template";
  initial?: Recipe | RecipeTemplate;
  /** When mode=edit, recipe id required. */
  recipeId?: string;
}

interface FormState {
  name: string;
  sourceChainId: number;
  totalAmount: string;
  outputs: RecipeOutput[];
}

function buildInitialState(
  mode: RecipeFormProps["mode"],
  initial?: Recipe | RecipeTemplate
): FormState {
  if (initial && "totalAmount" in initial) {
    // Recipe (edit mode)
    return {
      name: initial.name,
      sourceChainId: initial.sourceChainId,
      totalAmount: initial.totalAmount,
      outputs: [...initial.outputs],
    };
  }
  if (initial && "totalAmountSuggestion" in initial) {
    // Template (from-template mode)
    return {
      name: initial.name,
      sourceChainId: initial.sourceChainId,
      totalAmount: initial.totalAmountSuggestion,
      outputs: [...initial.outputs],
    };
  }
  // Create mode (blank)
  const defaultEvmIds = Object.keys(USDC_ADDRESSES).map(Number);
  return {
    name: "",
    sourceChainId: defaultEvmIds[0] ?? 11155111,
    totalAmount: "",
    outputs: [
      { destChainId: defaultEvmIds[1] ?? 84532, percentage: 100 },
    ],
  };
}

export function RecipeForm({ mode, initial, recipeId }: RecipeFormProps) {
  const router = useRouter();
  const { address } = useAccount();
  const { createRecipe, updateRecipe } = useRecipes();

  const [state, setState] = useState<FormState>(() =>
    buildInitialState(mode, initial)
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Live USDC balance for source chain (warning if amount > balance)
  const sourceUsdcAddress =
    USDC_ADDRESSES[state.sourceChainId as keyof typeof USDC_ADDRESSES];
  const { data: balanceData } = useBalance({
    address,
    token: sourceUsdcAddress as `0x${string}` | undefined,
    chainId: state.sourceChainId,
    query: {
      enabled: !!address && !!sourceUsdcAddress,
    },
  });

  // Validation runs every render (cheap, pure)
  const validationErrors = useMemo(() => {
    return validateRecipe({
      name: state.name,
      sourceChainId: state.sourceChainId,
      totalAmount: state.totalAmount,
      outputs: state.outputs,
    });
  }, [state]);

  const errorByField = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of validationErrors) m.set(e.field, e.message);
    return m;
  }, [validationErrors]);

  const totalPct = state.outputs.reduce((s, o) => s + o.percentage, 0);
  const isValid = validationErrors.length === 0;

  // Balance warning (non-blocking — recipes can be saved with amount > balance)
  const balanceFormatted = balanceData
    ? Number(balanceData.formatted).toFixed(2)
    : null;
  const exceedsBalance =
    balanceData &&
    state.totalAmount &&
    Number(state.totalAmount) > Number(balanceData.formatted);

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => {
    setSubmitError(null);
    setState((s) => ({ ...s, [key]: value }));
  };

  const updateOutput = (idx: number, output: RecipeOutput) => {
    setSubmitError(null);
    setState((s) => ({
      ...s,
      outputs: s.outputs.map((o, i) => (i === idx ? output : o)),
    }));
  };

  const addOutput = () => {
    if (state.outputs.length >= MAX_OUTPUTS) return;
    // Pick a destChain not yet used (and not the source)
    const usedChainIds = new Set([
      state.sourceChainId,
      ...state.outputs.map((o) => o.destChainId),
    ]);
    const evmIds = Object.keys(USDC_ADDRESSES).map(Number);
    const nextChainId =
      evmIds.find((id) => !usedChainIds.has(id)) ?? evmIds[0] ?? 11155111;

    setSubmitError(null);
    setState((s) => ({
      ...s,
      outputs: [
        ...s.outputs,
        { destChainId: nextChainId, percentage: 0 },
      ],
    }));
  };

  const removeOutput = (idx: number) => {
    if (state.outputs.length <= 1) return;
    setSubmitError(null);
    setState((s) => ({
      ...s,
      outputs: s.outputs.filter((_, i) => i !== idx),
    }));
  };

  const autoBalance = () => {
    setSubmitError(null);
    setState((s) => ({
      ...s,
      outputs: autoBalanceOutputs(s.outputs),
    }));
  };

  const handleSourceChange = (chainId: number) => {
    // If new source matches any existing dest, drop those rows (validation would catch but UX nicer)
    setSubmitError(null);
    setState((s) => ({
      ...s,
      sourceChainId: chainId,
      outputs: s.outputs.filter((o) => o.destChainId !== chainId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    if (mode === "edit" && recipeId) {
      const result = updateRecipe(recipeId, {
        name: state.name,
        sourceChainId: state.sourceChainId,
        totalAmount: state.totalAmount,
        outputs: state.outputs,
      });
      if (!result.success) {
        setSubmitError(result.errors[0]?.message ?? "Failed to save");
        setSubmitting(false);
        return;
      }
    } else {
      const result = createRecipe({
        name: state.name,
        sourceChainId: state.sourceChainId,
        totalAmount: state.totalAmount,
        outputs: state.outputs,
      });
      if (!result.success) {
        setSubmitError(result.errors[0]?.message ?? "Failed to create");
        setSubmitting(false);
        return;
      }
    }

    setShowSuccess(true);
    // Brief success flash, then redirect
    setTimeout(() => router.push("/recipes"), 600);
  };

  // Used dest chain IDs for excluding duplicates in each row's selector
  const destChainIdsByIndex = state.outputs.map((o) => o.destChainId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Recipe Name
        </label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. Diversify L2"
          maxLength={50}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
        />
        {errorByField.has("name") && state.name.length > 0 && (
          <p className="text-[11px] text-rose-400">
            {errorByField.get("name")}
          </p>
        )}
      </div>

      {/* Source + total amount row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChainSelector
          value={state.sourceChainId}
          onChange={handleSourceChange}
          label="Source Chain"
        />

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
            Total Amount (USDC)
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={state.totalAmount}
              onChange={(e) => updateField("totalAmount", e.target.value)}
              placeholder="100"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 pl-4 pr-16 py-3 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none font-mono tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">
              USDC
            </span>
          </div>
          {balanceFormatted && (
            <p className="text-[11px] text-zinc-500">
              Balance: <span className="font-mono">{balanceFormatted}</span> USDC
              {exceedsBalance && (
                <span className="ml-2 text-amber-400">
                  ⚠ exceeds current balance
                </span>
              )}
            </p>
          )}
          {errorByField.has("totalAmount") && state.totalAmount.length > 0 && (
            <p className="text-[11px] text-rose-400">
              {errorByField.get("totalAmount")}
            </p>
          )}
        </div>
      </div>

      {/* Outputs section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Outputs ({state.outputs.length}/{MAX_OUTPUTS})
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Where USDC goes. Percentages must sum to 100%.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={autoBalance}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] transition-colors"
              title="Distribute remaining percentage evenly"
            >
              ⚖ Auto-balance
            </button>
            <button
              type="button"
              onClick={addOutput}
              disabled={state.outputs.length >= MAX_OUTPUTS}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Output
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {state.outputs.map((output, idx) => (
            <RecipeOutputRow
              key={idx}
              index={idx}
              output={output}
              totalAmount={state.totalAmount}
              sourceChainId={state.sourceChainId}
              onChange={updateOutput}
              onRemove={removeOutput}
              canRemove={state.outputs.length > 1}
              excludeChainIds={destChainIdsByIndex.filter(
                (_, i) => i !== idx
              )}
            />
          ))}
        </div>

        {/* Sum indicator */}
        <div
          className={`flex items-center justify-between text-xs px-4 py-2.5 rounded-lg border ${
            totalPct === 100
              ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
              : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
          }`}
        >
          <span className="font-medium">
            Total: {totalPct.toFixed(0)}% / 100%
          </span>
          <span>
            {totalPct === 100
              ? "✓ Balanced"
              : totalPct < 100
              ? `${(100 - totalPct).toFixed(0)}% remaining`
              : `${(totalPct - 100).toFixed(0)}% over`}
          </span>
        </div>

        {errorByField.has("outputs") && (
          <p className="text-[11px] text-rose-400">
            {errorByField.get("outputs")}
          </p>
        )}
      </div>

      {/* Submit row */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => router.push("/recipes")}
          className="h-10 px-5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {submitError && (
            <span className="text-[11px] text-rose-400 max-w-xs truncate">
              {submitError}
            </span>
          )}
          {showSuccess && (
            <span className="text-[11px] text-emerald-400 font-medium">
              ✓ Saved! Redirecting…
            </span>
          )}
          <button
            type="submit"
            disabled={!isValid || submitting || showSuccess}
            className="h-10 px-6 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {submitting
              ? "Saving…"
              : mode === "edit"
              ? "Update Recipe"
              : "Save Recipe"}
          </button>
        </div>
      </div>
    </form>
  );
}
