"use client";

import { UsdcBalances } from "@/components/usdc-balances";
import { BridgeForm } from "@/components/bridge-form";

export default function BridgePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Bridge USDC</h1>
        <p className="text-zinc-500 text-sm">
          Cross-chain via Circle CCTP V2 — testnet only
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3 font-semibold">
            Your USDC Holdings
          </h2>
          <UsdcBalances />
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3 font-semibold">
            Bridge Form
          </h2>
          <BridgeForm />
        </section>
      </div>
    </div>
  );
}
