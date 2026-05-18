"use client";

import { BridgeHistory } from "@/components/bridge-history";

export default function HistoryPage() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-6 lg:py-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Bridge History</h1>
        <p className="text-zinc-500 text-sm">
          All your past bridges, complete and failed
        </p>
      </header>

      <BridgeHistory />
    </div>
  );
}
