"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { UsdcBalances } from "@/components/usdc-balances";
import { BridgeForm } from "@/components/bridge-form";
import { BridgeHistory } from "@/components/bridge-history";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — solid bg, no backdrop-blur */}
      <header className="border-b border-zinc-800/50 sticky top-0 z-50 bg-zinc-950">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌐</span>
            <h1 className="text-lg font-bold tracking-tight">Chain Hopper</h1>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Hero — static gradient, no animation */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Cross-chain USDC
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              made simple
            </span>
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            View and bridge USDC across 6 EVM testnets via Circle CCTP.
            One click, transparent fees, no surprises.
          </p>
        </div>

        {/* Two-column on md+, stacked on mobile */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Left: Balance section */}
          <section>
            <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-4 font-medium">
              Your USDC Holdings
            </h3>
            <UsdcBalances />
          </section>

          {/* Right: Bridge form */}
          <section>
            <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-4 font-medium">
              Bridge USDC
            </h3>
            <BridgeForm />
          </section>
        </div>

        {/* Bridge History */}
        <section className="mt-12">
          <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-4 font-medium">
            History
          </h3>
          <BridgeHistory />
        </section>

        {/* Coming soon */}
        <section className="max-w-3xl mx-auto mt-16">
          <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-4 font-medium">
            Coming Soon
          </h3>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              { icon: "🔄", title: "Multi-Aggregator", desc: "Relay, Across, LiFi quotes" },
              { icon: "💱", title: "Swap", desc: "1inch + Jupiter integration" },
              { icon: "📜", title: "Recipes", desc: "Save & schedule routes" },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 opacity-60"
              >
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-zinc-500 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-6 text-center text-xs text-zinc-500">
        <p>
          Built with Circle USDC ·{" "}
          <a
            href="https://github.com/Randimt/chain-hopper"
            className="hover:text-zinc-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source
          </a>
        </p>
      </footer>
    </div>
  );
}
