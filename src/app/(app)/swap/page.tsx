"use client";

import { SwapForm } from "@/components/swap-form";

export default function SwapPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl font-bold">Swap</h1>
          <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase leading-none">
            Beta
          </span>
        </div>
        <p className="text-zinc-500 text-sm">
          Same-chain token swap on Arc Testnet via Circle App Kit
        </p>
      </header>

      <SwapForm />

      {/* Info cards */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl mb-2">⚡</div>
          <div className="font-semibold text-sm mb-1">Sub-second finality</div>
          <div className="text-[11px] text-zinc-500">
            Powered by Arc&apos;s deterministic settlement
          </div>
        </div>
        <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl mb-2">🔗</div>
          <div className="font-semibold text-sm mb-1">Circle infrastructure</div>
          <div className="text-[11px] text-zinc-500">
            App Kit Swap Kit · USDC issuer-grade
          </div>
        </div>
        <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
          <div className="text-2xl mb-2">🛡️</div>
          <div className="font-semibold text-sm mb-1">Same-chain only</div>
          <div className="text-[11px] text-zinc-500">
            Cross-chain via Bridge menu (atomic batch CCTP V2)
          </div>
        </div>
      </div>
    </div>
  );
}
