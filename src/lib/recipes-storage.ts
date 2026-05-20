"use client";

/**
 * Recipes storage — Phase 3 multi-output bridge presets.
 *
 * A "Recipe" is a saved configuration for splitting a single source amount
 * across multiple destination chains in one click.
 *
 * Example: 100 USDC from Sepolia → 40% Base, 30% Arc, 20% Solana, 10% Optimism.
 *
 * Persisted per wallet address in localStorage. Schema versioned for future
 * migration to backend sync (v2).
 */

const RECIPES_KEY = "plix:recipes";
const MAX_RECIPES = 30;
const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface RecipeOutput {
  /** Destination chain ID */
  destChainId: number;
  /** Percentage allocation 0-100 (sum across outputs must equal 100) */
  percentage: number;
  /** Optional friendly label for this output */
  label?: string;
}

export interface Recipe {
  /** Unique recipe ID */
  id: string;
  /** User-given name */
  name: string;
  /** Source chain ID */
  sourceChainId: number;
  /** Total amount in human units (e.g. "100" for 100 USDC) */
  totalAmount: string;
  /** Output destinations (1-5) */
  outputs: RecipeOutput[];
  /** Schema version for future migrations */
  version: number;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Last edit timestamp (ms) */
  updatedAt: number;
  /** Last successful run timestamp (ms) */
  lastRunAt?: number;
  /** Number of times this recipe was run */
  runCount?: number;
}

export type RecipeRunStatus =
  | "pending"
  | "approving"
  | "burning"
  | "attesting"
  | "minting"
  | "complete"
  | "failed";

export interface RecipeOutputStatus {
  destChainId: number;
  amount: string;
  status: RecipeRunStatus;
  burnTxHash?: `0x${string}`;
  mintTxHash?: `0x${string}`;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface RecipeRun {
  /** Recipe being executed */
  recipeId: string;
  /** Unique run instance ID */
  runId: string;
  /** Wallet address running it */
  address: string;
  /** Source chain ID at time of run (snapshot) */
  sourceChainId: number;
  /** Run start timestamp */
  startedAt: number;
  /** Approve tx hash (single approve for total) */
  approveTxHash?: `0x${string}`;
  /** Per-output execution state */
  outputs: RecipeOutputStatus[];
  /** Run completion timestamp */
  completedAt?: number;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface RecipeValidationError {
  field: string;
  message: string;
}

export const MAX_OUTPUTS = 5;
export const MIN_OUTPUTS = 1;

export function validateRecipe(
  recipe: Partial<Recipe>
): RecipeValidationError[] {
  const errors: RecipeValidationError[] = [];

  if (!recipe.name || recipe.name.trim().length === 0) {
    errors.push({ field: "name", message: "Recipe name is required" });
  } else if (recipe.name.length > 50) {
    errors.push({ field: "name", message: "Name must be ≤ 50 characters" });
  }

  if (!recipe.sourceChainId || recipe.sourceChainId <= 0) {
    errors.push({
      field: "sourceChainId",
      message: "Source chain is required",
    });
  }

  if (!recipe.totalAmount || !/^\d+(\.\d+)?$/.test(recipe.totalAmount)) {
    errors.push({
      field: "totalAmount",
      message: "Total amount must be a positive number",
    });
  } else if (parseFloat(recipe.totalAmount) <= 0) {
    errors.push({ field: "totalAmount", message: "Amount must be > 0" });
  }

  if (!recipe.outputs || recipe.outputs.length < MIN_OUTPUTS) {
    errors.push({
      field: "outputs",
      message: `At least ${MIN_OUTPUTS} output required`,
    });
  } else if (recipe.outputs.length > MAX_OUTPUTS) {
    errors.push({
      field: "outputs",
      message: `Maximum ${MAX_OUTPUTS} outputs allowed`,
    });
  } else {
    // Validate output structure
    let totalPct = 0;
    const seenChains = new Set<number>();

    for (let i = 0; i < recipe.outputs.length; i++) {
      const out = recipe.outputs[i];
      if (!out.destChainId || out.destChainId <= 0) {
        errors.push({
          field: `outputs.${i}.destChainId`,
          message: "Destination chain required",
        });
      }
      if (out.destChainId === recipe.sourceChainId) {
        errors.push({
          field: `outputs.${i}.destChainId`,
          message: "Destination cannot equal source",
        });
      }
      if (out.destChainId && seenChains.has(out.destChainId)) {
        errors.push({
          field: `outputs.${i}.destChainId`,
          message: "Duplicate destination chain",
        });
      }
      seenChains.add(out.destChainId);

      if (
        typeof out.percentage !== "number" ||
        out.percentage <= 0 ||
        out.percentage > 100
      ) {
        errors.push({
          field: `outputs.${i}.percentage`,
          message: "Percentage must be 0-100",
        });
      }
      totalPct += out.percentage || 0;
    }

    // Sum check (allow tiny floating point drift)
    if (Math.abs(totalPct - 100) > 0.01) {
      errors.push({
        field: "outputs",
        message: `Output percentages must sum to 100 (currently ${totalPct.toFixed(2)})`,
      });
    }
  }

  return errors;
}

/**
 * Compute per-output amount from percentage and total.
 * Returns string in human units.
 */
export function computeOutputAmount(
  totalAmount: string,
  percentage: number
): string {
  const total = parseFloat(totalAmount);
  if (Number.isNaN(total)) return "0";
  const result = (total * percentage) / 100;
  // Round to 6 decimals (USDC has 6 decimal precision)
  return result.toFixed(6).replace(/\.?0+$/, "");
}

/**
 * Auto-balance: distribute remaining percentage evenly across outputs
 * with percentage = 0. Used by form "auto-balance" button.
 */
export function autoBalanceOutputs(
  outputs: RecipeOutput[]
): RecipeOutput[] {
  const fixed = outputs.filter((o) => o.percentage > 0);
  const unfixed = outputs.filter((o) => o.percentage <= 0);
  if (unfixed.length === 0) return outputs;

  const usedPct = fixed.reduce((sum, o) => sum + o.percentage, 0);
  const remainPct = Math.max(0, 100 - usedPct);
  const sharePct = remainPct / unfixed.length;

  return outputs.map((o) =>
    o.percentage > 0 ? o : { ...o, percentage: sharePct }
  );
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

function storageKey(address: string): string {
  return `${RECIPES_KEY}:${address.toLowerCase()}`;
}

export function loadRecipes(address?: string): Recipe[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out invalid entries (corrupted storage)
    return parsed.filter(
      (r): r is Recipe =>
        typeof r === "object" &&
        r !== null &&
        typeof r.id === "string" &&
        typeof r.name === "string" &&
        typeof r.sourceChainId === "number" &&
        Array.isArray(r.outputs)
    );
  } catch {
    return [];
  }
}

export function saveRecipes(address: string, recipes: Recipe[]): void {
  try {
    const trimmed = recipes.slice(0, MAX_RECIPES);
    localStorage.setItem(storageKey(address), JSON.stringify(trimmed));
    window.dispatchEvent(new Event("plix-recipes-updated"));
  } catch {
    /* quota / private mode */
  }
}

export function getRecipe(
  address: string,
  recipeId: string
): Recipe | undefined {
  return loadRecipes(address).find((r) => r.id === recipeId);
}

export function upsertRecipe(address: string, recipe: Recipe): void {
  const existing = loadRecipes(address);
  const idx = existing.findIndex((r) => r.id === recipe.id);
  const now = Date.now();

  const next: Recipe = {
    ...recipe,
    version: SCHEMA_VERSION,
    updatedAt: now,
    createdAt: idx >= 0 ? existing[idx].createdAt : now,
  };

  if (idx >= 0) {
    existing[idx] = next;
  } else {
    existing.push(next);
  }

  saveRecipes(address, existing);
}

export function deleteRecipe(address: string, recipeId: string): void {
  const existing = loadRecipes(address);
  const filtered = existing.filter((r) => r.id !== recipeId);
  saveRecipes(address, filtered);
}

export function markRecipeRun(address: string, recipeId: string): void {
  const existing = loadRecipes(address);
  const idx = existing.findIndex((r) => r.id === recipeId);
  if (idx < 0) return;

  existing[idx] = {
    ...existing[idx],
    lastRunAt: Date.now(),
    runCount: (existing[idx].runCount ?? 0) + 1,
  };

  saveRecipes(address, existing);
}

export function clearAllRecipes(address: string): void {
  try {
    localStorage.removeItem(storageKey(address));
    window.dispatchEvent(new Event("plix-recipes-updated"));
  } catch {
    /* ignore */
  }
}

export function generateRecipeId(): string {
  return `rcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Recipe Run storage (separate key for active/recent runs)            */
/* ------------------------------------------------------------------ */

const RUNS_KEY = "plix:recipe-runs";
const MAX_RUNS = 20;

function runsStorageKey(address: string): string {
  return `${RUNS_KEY}:${address.toLowerCase()}`;
}

export function loadRecipeRuns(address?: string): RecipeRun[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(runsStorageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecipeRun(address: string, run: RecipeRun): void {
  try {
    const existing = loadRecipeRuns(address);
    const idx = existing.findIndex((r) => r.runId === run.runId);
    if (idx >= 0) existing[idx] = run;
    else existing.push(run);
    const trimmed = existing.slice(-MAX_RUNS);
    localStorage.setItem(runsStorageKey(address), JSON.stringify(trimmed));
    window.dispatchEvent(new Event("plix-recipe-run-updated"));
  } catch {
    /* quota / private mode */
  }
}

export function getActiveRecipeRun(address?: string): RecipeRun | undefined {
  if (!address) return undefined;
  const runs = loadRecipeRuns(address);
  // Active = no completedAt timestamp
  return runs.find((r) => !r.completedAt);
}

/* ------------------------------------------------------------------ */
/* Recipe Queue (Stage 5 — sequential multi-output execution)         */
/* ------------------------------------------------------------------ */

const QUEUE_KEY = "plix:recipe-queue";

export interface RecipeQueueOutput {
  destChainId: number;
  amount: string; // human units, computed from totalAmount × percentage
  percentage: number;
}

export interface RecipeQueueState {
  /** Recipe being executed */
  recipeId: string;
  /** Recipe name (snapshot for banner) */
  recipeName: string;
  /** Source chain (snapshot) */
  sourceChainId: number;
  /** All outputs in execution order */
  outputs: RecipeQueueOutput[];
  /** Current output index being executed (0-based) */
  currentIndex: number;
  /** Outputs already completed (by index) */
  completedIndices: number[];
  /** Outputs skipped by user (by index) */
  skippedIndices: number[];
  /** Run start timestamp */
  startedAt: number;
}

function queueStorageKey(address: string): string {
  return `${QUEUE_KEY}:${address.toLowerCase()}`;
}

export function loadRecipeQueue(address?: string): RecipeQueueState | null {
  if (typeof window === "undefined" || !address) return null;
  try {
    const raw = localStorage.getItem(queueStorageKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.currentIndex !== "number") return null;
    return parsed as RecipeQueueState;
  } catch {
    return null;
  }
}

export function saveRecipeQueue(address: string, queue: RecipeQueueState): void {
  try {
    localStorage.setItem(queueStorageKey(address), JSON.stringify(queue));
    window.dispatchEvent(new Event("plix-recipe-queue-updated"));
  } catch {
    /* quota / private mode */
  }
}

export function clearRecipeQueue(address: string): void {
  try {
    localStorage.removeItem(queueStorageKey(address));
    window.dispatchEvent(new Event("plix-recipe-queue-updated"));
  } catch {
    /* ignore */
  }
}

/**
 * Advance queue to next output. Returns updated queue state.
 * Marks current index as completed before advancing.
 */
export function advanceRecipeQueue(
  address: string,
  reason: "completed" | "skipped" = "completed"
): RecipeQueueState | null {
  const current = loadRecipeQueue(address);
  if (!current) return null;

  const nextCompleted =
    reason === "completed"
      ? [...current.completedIndices, current.currentIndex]
      : current.completedIndices;
  const nextSkipped =
    reason === "skipped"
      ? [...current.skippedIndices, current.currentIndex]
      : current.skippedIndices;

  const updated: RecipeQueueState = {
    ...current,
    currentIndex: current.currentIndex + 1,
    completedIndices: nextCompleted,
    skippedIndices: nextSkipped,
  };
  saveRecipeQueue(address, updated);
  return updated;
}

/**
 * Check if queue has more outputs to execute after the current one.
 */
export function hasMoreOutputs(queue: RecipeQueueState | null): boolean {
  if (!queue) return false;
  return queue.currentIndex < queue.outputs.length - 1;
}

/**
 * Check if queue is fully complete (current index past last).
 */
export function isQueueComplete(queue: RecipeQueueState | null): boolean {
  if (!queue) return false;
  return queue.currentIndex >= queue.outputs.length;
}

/* ------------------------------------------------------------------ */
/* Templates (suggested recipes for new users)                         */
/* ------------------------------------------------------------------ */

export interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  sourceChainId: number;
  totalAmountSuggestion: string;
  outputs: RecipeOutput[];
}

/**
 * Built-in recipe templates. Used to seed empty state.
 * User clicks template → form prefills, user can edit before save.
 */
export const RECIPE_TEMPLATES: RecipeTemplate[] = [
  {
    id: "tmpl_l2_diversify",
    name: "Diversify across L2s",
    description: "Split across Base, Arc, and Optimism testnets",
    sourceChainId: 11155111, // Sepolia
    totalAmountSuggestion: "1.0",
    outputs: [
      { destChainId: 84532, percentage: 40, label: "Base Sepolia" },
      { destChainId: 5042002, percentage: 35, label: "Arc Testnet" },
      { destChainId: 11155420, percentage: 25, label: "Optimism Sepolia" },
    ],
  },
  {
    id: "tmpl_cross_vm",
    name: "Cross-VM split",
    description: "Mix EVM L2 + Solana for cross-VM exposure",
    sourceChainId: 11155111, // Sepolia
    totalAmountSuggestion: "1.0",
    outputs: [
      { destChainId: 84532, percentage: 50, label: "Base Sepolia" },
      { destChainId: 999999001, percentage: 50, label: "Solana Devnet" },
    ],
  },
  {
    id: "tmpl_solana_focus",
    name: "Solana focus",
    description: "Bridge majority to Solana, keep some on EVM",
    sourceChainId: 11155111, // Sepolia
    totalAmountSuggestion: "1.0",
    outputs: [
      { destChainId: 999999001, percentage: 70, label: "Solana Devnet" },
      { destChainId: 84532, percentage: 30, label: "Base Sepolia" },
    ],
  },
];
