"use client";

/**
 * useRecipes — React reactive wrapper around recipes-storage.
 *
 * Subscribes to "plix-recipes-updated" custom events for cross-tab/cross-component
 * reactivity (same pattern as useQuotes + plix-settings-updated).
 *
 * Returns:
 *   - recipes: current list (sorted newest-first by updatedAt)
 *   - loading: SSR-safe initial render flag
 *   - actions: create, update, remove, run mark
 *   - error: validation errors from last create/update attempt
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  Recipe,
  RecipeValidationError,
  deleteRecipe as deleteRecipeStorage,
  generateRecipeId,
  loadRecipes,
  markRecipeRun as markRecipeRunStorage,
  upsertRecipe,
  validateRecipe,
} from "@/lib/recipes-storage";

export interface UseRecipesResult {
  /** All recipes for connected wallet, sorted by updatedAt desc */
  recipes: Recipe[];
  /** True until first client-side load completes (SSR-safe gate) */
  loading: boolean;
  /** Address recipes are scoped to (lowercased) */
  address?: string;

  /**
   * Create new recipe. Returns recipeId on success, validation errors on fail.
   * `recipe` should NOT include id/createdAt/updatedAt/version (auto-managed).
   */
  createRecipe: (
    recipe: Omit<Recipe, "id" | "createdAt" | "updatedAt" | "version">
  ) =>
    | { success: true; id: string }
    | { success: false; errors: RecipeValidationError[] };

  /**
   * Update existing recipe by id. Returns success/errors.
   */
  updateRecipe: (
    id: string,
    updates: Partial<Omit<Recipe, "id" | "createdAt" | "version">>
  ) =>
    | { success: true }
    | { success: false; errors: RecipeValidationError[] };

  /** Remove recipe by id. */
  removeRecipe: (id: string) => void;

  /** Mark recipe as just-run (updates lastRunAt + runCount). */
  markRun: (id: string) => void;

  /** Manual refresh (forces reload from storage). */
  refresh: () => void;
}

export function useRecipes(): UseRecipesResult {
  const { address } = useAccount();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!address) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    const loaded = loadRecipes(address);
    // Sort newest-first by updatedAt
    loaded.sort((a, b) => b.updatedAt - a.updatedAt);
    setRecipes(loaded);
    setLoading(false);
  }, [address]);

  // Initial load + react to address changes
  useEffect(() => {
    reload();
  }, [reload]);

  // Subscribe to cross-component recipe updates
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener("plix-recipes-updated", handler);
    // Also react to storage events from OTHER tabs
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("plix:recipes")) reload();
    });
    return () => {
      window.removeEventListener("plix-recipes-updated", handler);
    };
  }, [reload]);

  const createRecipe = useCallback<UseRecipesResult["createRecipe"]>(
    (input) => {
      if (!address) {
        return {
          success: false,
          errors: [{ field: "address", message: "Wallet not connected" }],
        };
      }

      // Validate first (without id/timestamps which are auto)
      const errors = validateRecipe({
        name: input.name,
        sourceChainId: input.sourceChainId,
        totalAmount: input.totalAmount,
        outputs: input.outputs,
      });

      if (errors.length > 0) return { success: false, errors };

      const id = generateRecipeId();
      const now = Date.now();
      upsertRecipe(address, {
        id,
        name: input.name.trim(),
        sourceChainId: input.sourceChainId,
        totalAmount: input.totalAmount,
        outputs: input.outputs,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, id };
    },
    [address]
  );

  const updateRecipe = useCallback<UseRecipesResult["updateRecipe"]>(
    (id, updates) => {
      if (!address) {
        return {
          success: false,
          errors: [{ field: "address", message: "Wallet not connected" }],
        };
      }
      const existing = loadRecipes(address).find((r) => r.id === id);
      if (!existing) {
        return {
          success: false,
          errors: [{ field: "id", message: "Recipe not found" }],
        };
      }

      const merged: Recipe = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        version: existing.version,
        updatedAt: Date.now(),
        // Trim name if provided
        name: updates.name ? updates.name.trim() : existing.name,
      };

      const errors = validateRecipe(merged);
      if (errors.length > 0) return { success: false, errors };

      upsertRecipe(address, merged);
      return { success: true };
    },
    [address]
  );

  const removeRecipe = useCallback(
    (id: string) => {
      if (!address) return;
      deleteRecipeStorage(address, id);
    },
    [address]
  );

  const markRun = useCallback(
    (id: string) => {
      if (!address) return;
      markRecipeRunStorage(address, id);
    },
    [address]
  );

  return {
    recipes,
    loading,
    address: address?.toLowerCase(),
    createRecipe,
    updateRecipe,
    removeRecipe,
    markRun,
    refresh: reload,
  };
}
