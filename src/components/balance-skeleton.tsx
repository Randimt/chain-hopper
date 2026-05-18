"use client";

// Skeleton loading state for USDC balances. Mirrors the real layout so there's
// no jump on hydration. Pure CSS animation (animate-pulse), no JS.

export function BalanceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Total card skeleton */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900/50 p-6">
        <div className="h-3 w-32 rounded bg-zinc-800" />
        <div className="mt-3 h-9 w-24 rounded bg-zinc-800" />
        <div className="mt-3 h-3 w-40 rounded bg-zinc-800" />
      </div>

      {/* Per-chain skeleton (4 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-zinc-800" />
              <div className="h-3 w-20 rounded bg-zinc-800" />
            </div>
            <div className="mt-3 h-6 w-16 rounded bg-zinc-800" />
            <div className="mt-2 h-3 w-12 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
