"use client";

import Link from "next/link";

export default function BatchPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold">Batch Bridge</h1>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase">
              Soon
            </span>
          </div>
          <p className="text-zinc-500 text-sm">
            Fan-out splitter — split USDC across multiple chains in 1 transaction
          </p>
        </div>
        <Link
          href="/recipes"
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Use Recipes (sequential queue) →
        </Link>
      </header>

      {/* HERO PLACEHOLDER */}
      <div className="bg-gradient-to-br from-amber-500/[0.04] via-purple-500/[0.04] to-cyan-500/[0.04] border border-amber-500/20 rounded-2xl p-8 sm:p-12 text-center mb-8">
        <div className="text-6xl mb-4 animate-pulse">⚡</div>
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">
          1 click. <span className="bg-gradient-to-br from-amber-400 to-cyan-400 bg-clip-text text-transparent">5 chains.</span>
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto mb-6 leading-relaxed">
          Bridge 100 USDC from Arc to Base + Sepolia + Polygon + Optimism + Arbitrum
          atomically — single approve, single signature, native CCTP V2.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          In active development · Q3 2026
        </div>
      </div>

      {/* FLOW PREVIEW */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-4 text-amber-400">
            // current flow (sequential)
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2.5 text-zinc-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
              <span>Approve N times (per output)</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
              <span>Bridge N times (sequential queue)</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
              <span>Wait N attestations sequential</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-bold flex items-center justify-center mt-0.5">4</span>
              <span>Mint N times</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 font-mono text-[11px] text-amber-400/80">
            ~2N+ wallet popups · ~30N seconds total
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500/[0.06] to-blue-500/[0.04] border border-cyan-500/30 rounded-xl p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-4 text-cyan-400">
            // batch flow (atomic)
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2.5 text-zinc-200">
              <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
              <span>Single approve (LyxsaSplitter)</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-200">
              <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
              <span>Single batch tx (5 burns atomic)</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-200">
              <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
              <span>5 attestations parallel (Promise.all)</span>
            </div>
            <div className="flex items-start gap-2.5 text-zinc-200">
              <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 text-[11px] font-bold flex items-center justify-center mt-0.5">4</span>
              <span>Auto-mint relayer (or user 5 mints)</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 font-mono text-[11px] text-cyan-400">
            2 wallet popups · ~30 seconds total
          </div>
        </div>
      </div>

      {/* TECHNICAL SPECS */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.15em] mb-4 text-zinc-500">
          // technical specs
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-zinc-200 font-semibold mb-1">Smart contract</div>
            <div className="text-zinc-500 text-[13px] leading-relaxed">
              LyxsaSplitter.sol — wraps CCTP V2 TokenMessenger.
              Custom Solidity contract deployed on 22 EVM testnets via deterministic
              CREATE2 (same address everywhere).
            </div>
          </div>
          <div>
            <div className="text-zinc-200 font-semibold mb-1">Atomicity</div>
            <div className="text-zinc-500 text-[13px] leading-relaxed">
              All burns succeed or all revert. No partial-failure state.
              Up to 5 destinations per batch tx (gas-optimized).
            </div>
          </div>
          <div>
            <div className="text-zinc-200 font-semibold mb-1">Native USDC</div>
            <div className="text-zinc-500 text-[13px] leading-relaxed">
              No wrapped tokens. Each destination receives canonical USDC
              via CCTP V2 burn-and-mint flow. Iris attestations track per-output.
            </div>
          </div>
          <div>
            <div className="text-zinc-200 font-semibold mb-1">Multi-chain ready</div>
            <div className="text-zinc-500 text-[13px] leading-relaxed">
              EVM source → up to 5 EVM destinations.
              Solana destination support deferred (CCTP V2 SVM batch limitation).
            </div>
          </div>
        </div>
      </div>

      {/* CALL TO ACTION */}
      <div className="bg-gradient-to-r from-purple-500/[0.04] to-cyan-500/[0.04] border border-purple-500/20 rounded-xl p-6 text-center">
        <div className="text-zinc-300 text-sm mb-4 leading-relaxed">
          Want this feature? Try the <strong className="text-white">sequential queue</strong> available
          today via Recipes — same multi-output result, just N wallet popups instead of 1.
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/recipes"
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
          >
            <span>Try Recipes</span>
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/#roadmap"
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-200 text-sm font-medium hover:bg-white/[0.06] transition-colors"
          >
            <span>View Roadmap</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
