"use client";

/**
 * /recipes/new — Create a new recipe.
 *
 * Optionally prefilled from template via ?template=<templateId> query param.
 */

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { RecipeForm } from "@/components/recipe-form";
import { RECIPE_TEMPLATES } from "@/lib/recipes-storage";
import Link from "next/link";

function NewRecipeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const templateId = searchParams.get("template");
  const template = templateId
    ? RECIPE_TEMPLATES.find((t) => t.id === templateId)
    : undefined;

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-12 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-2xl">
          🔌
        </div>
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">
          Connect wallet to create recipes
        </h3>
        <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
          Recipes are stored per wallet address.
        </p>
        <button
          onClick={() => openConnectModal?.()}
          className="h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <>
      {template && (
        <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-sm shrink-0">
              📋
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-purple-300 mb-1">
                Using template: {template.name}
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {template.description}
              </p>
            </div>
            <button
              onClick={() => router.push("/recipes/new")}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-white/[0.04] leading-none"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <RecipeForm
        mode={template ? "from-template" : "create"}
        initial={template}
      />
    </>
  );
}

export default function NewRecipePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/recipes" className="hover:text-zinc-300 transition-colors">
          Recipes
        </Link>
        <span>›</span>
        <span className="text-zinc-300">New</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">
          New Recipe
        </h1>
        <p className="text-sm text-zinc-400">
          Configure a bridge preset. Save it now, run it later (Stage 4+).
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
        <NewRecipeContent />
      </Suspense>
    </div>
  );
}
