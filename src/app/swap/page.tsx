"use client";

export default function SwapPage() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-6 lg:py-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Swap</h1>
        <p className="text-zinc-500 text-sm">Coming in Phase 2</p>
      </header>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-12 text-center">
        <div className="text-6xl mb-4">💱</div>
        <h2 className="text-xl font-bold mb-2">Swap is Coming Soon</h2>
        <p className="text-zinc-500 text-sm max-w-md mx-auto mb-6">
          Swap USDC ↔ other tokens via 1inch and 0x aggregator integration.
          Currently in design phase.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl mb-2">🔥</div>
            <div className="font-semibold text-sm mb-1">Best Price</div>
            <div className="text-[11px] text-zinc-500">
              Quote from multiple aggregators
            </div>
          </div>
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl mb-2">🛡️</div>
            <div className="font-semibold text-sm mb-1">MEV Protected</div>
            <div className="text-[11px] text-zinc-500">
              Slippage guards built-in
            </div>
          </div>
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
            <div className="text-2xl mb-2">⚡</div>
            <div className="font-semibold text-sm mb-1">Bridge + Swap</div>
            <div className="text-[11px] text-zinc-500">
              Combine in single tx
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
