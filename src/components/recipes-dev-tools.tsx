"use client";

/**
 * Dev-only console helper for Recipes (Phase 3 Stage 1).
 *
 * Exposes window.plix._recipes for manual testing in browser console:
 *
 *   window.plix._recipes.list()
 *   window.plix._recipes.create({ name, sourceChainId, totalAmount, outputs })
 *   window.plix._recipes.get(id)
 *   window.plix._recipes.update(id, partial)
 *   window.plix._recipes.delete(id)
 *   window.plix._recipes.markRun(id)
 *   window.plix._recipes.templates()
 *   window.plix._recipes.seedDemo()    // create 1 sample recipe
 *   window.plix._recipes.clearAll()    // wipe all recipes (DESTRUCTIVE)
 *
 * Address is read from connected wagmi wallet at call time.
 * Mounts only in development OR when ?_devTools=1 is in URL.
 */

import { useEffect } from "react";
import { useAccount } from "wagmi";
import {
  Recipe,
  RECIPE_TEMPLATES,
  clearAllRecipes,
  computeOutputAmount,
  deleteRecipe,
  generateRecipeId,
  getRecipe,
  loadRecipes,
  markRecipeRun,
  upsertRecipe,
  validateRecipe,
} from "@/lib/recipes-storage";

declare global {
  interface Window {
    plix?: {
      _recipes?: {
        list: () => Recipe[];
        get: (id: string) => Recipe | undefined;
        create: (input: {
          name: string;
          sourceChainId: number;
          totalAmount: string;
          outputs: { destChainId: number; percentage: number; label?: string }[];
        }) => { ok: true; id: string } | { ok: false; errors: unknown };
        update: (id: string, updates: Partial<Recipe>) => boolean;
        delete: (id: string) => void;
        markRun: (id: string) => void;
        templates: () => typeof RECIPE_TEMPLATES;
        seedDemo: () => string | null;
        clearAll: () => void;
        computeAmount: (total: string, pct: number) => string;
      };
    };
  }
}

export function RecipesDevTools() {
  const { address } = useAccount();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only enable in dev or with ?_devTools=1 query
    const isDev = process.env.NODE_ENV === "development";
    const isQueryEnabled = window.location.search.includes("_devTools=1");
    if (!isDev && !isQueryEnabled) return;

    if (!window.plix) window.plix = {};

    window.plix._recipes = {
      list: () => loadRecipes(address),

      get: (id) => (address ? getRecipe(address, id) : undefined),

      create: (input) => {
        if (!address) {
          return { ok: false, errors: ["Wallet not connected"] };
        }
        const errors = validateRecipe(input);
        if (errors.length > 0) return { ok: false, errors };

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
        return { ok: true, id };
      },

      update: (id, updates) => {
        if (!address) return false;
        const existing = getRecipe(address, id);
        if (!existing) return false;
        const merged = { ...existing, ...updates, updatedAt: Date.now() };
        const errors = validateRecipe(merged);
        if (errors.length > 0) {
          console.warn("[recipes] validation failed:", errors);
          return false;
        }
        upsertRecipe(address, merged);
        return true;
      },

      delete: (id) => {
        if (!address) return;
        deleteRecipe(address, id);
      },

      markRun: (id) => {
        if (!address) return;
        markRecipeRun(address, id);
      },

      templates: () => RECIPE_TEMPLATES,

      seedDemo: () => {
        if (!address) {
          console.warn("[recipes] connect wallet first");
          return null;
        }
        const id = generateRecipeId();
        const now = Date.now();
        upsertRecipe(address, {
          id,
          name: "Demo recipe",
          sourceChainId: 11155111, // Sepolia
          totalAmount: "1.0",
          outputs: [
            { destChainId: 84532, percentage: 50, label: "Base Sepolia" },
            {
              destChainId: 999999001,
              percentage: 50,
              label: "Solana Devnet",
            },
          ],
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        console.info(`[recipes] seeded demo recipe id=${id}`);
        return id;
      },

      clearAll: () => {
        if (!address) return;
        if (
          !confirm(
            "Clear ALL recipes for current wallet? This cannot be undone."
          )
        ) {
          return;
        }
        clearAllRecipes(address);
        console.info("[recipes] all recipes cleared");
      },

      computeAmount: computeOutputAmount,
    };

    // eslint-disable-next-line no-console
    console.info(
      "[recipes-dev] window.plix._recipes ready. Try: window.plix._recipes.seedDemo()"
    );

    return () => {
      if (window.plix?._recipes) {
        delete window.plix._recipes;
      }
    };
  }, [address]);

  return null;
}
