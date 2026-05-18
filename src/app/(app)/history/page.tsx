"use client";

import { BridgeHistory } from "@/components/bridge-history";

export default function HistoryPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
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
