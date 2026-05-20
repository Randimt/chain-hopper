"use client";

/**
 * /recipes/[id]/edit — Edit existing recipe.
 *
 * Loads recipe by ID from useRecipes(), prefills form, saves via updateRecipe().
 */

import { use } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRecipes } from "@/hooks/useRecipes";
import { RecipeForm } from "@/components/recipe-form";
import Link from "next/link";

interface EditRecipePageProps {
  params: Promise<{ id: string }>;
}

export default function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = use(params);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { recipes, loading } = useRecipes();

  const recipe = recipes.find((r) => r.id === id);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/recipes" className="hover:text-zinc-300 transition-colors">
          Recipes
        </Link>
        <span>›</span>
        <span className="text-zinc-300">Edit</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">
          Edit Recipe
        </h1>
        <p className="text-sm text-zinc-400">
          Update bridge configuration. Last-run history is preserved.
        </p>
      </div>

      {!isConnected && (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-2xl">
            🔌
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            Connect wallet to edit recipes
          </h3>
          <button
            onClick={() => openConnectModal?.()}
            className="mt-4 h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {isConnected && loading && (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-8 text-center">
          <div className="text-sm text-zinc-500 animate-pulse">
            Loading recipe…
          </div>
        </div>
      )}

      {isConnected && !loading && !recipe && (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-rose-500/10 flex items-center justify-center text-2xl">
            🔍
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            Recipe not found
          </h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            This recipe doesn&apos;t exist or belongs to a different wallet
            address.
          </p>
          <Link
            href="/recipes"
            className="inline-block h-10 leading-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            Back to Recipes
          </Link>
        </div>
      )}

      {isConnected && !loading && recipe && (
        <RecipeForm mode="edit" initial={recipe} recipeId={id} />
      )}
    </div>
  );
}
