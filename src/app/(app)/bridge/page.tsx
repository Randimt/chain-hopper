"use client";

import { UsdcBalancesCompact } from "@/components/usdc-balances-compact";
import { BridgeForm } from "@/components/bridge-form";

export default function BridgePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-20">
          <UsdcBalancesCompact />
        </aside>

        <section>
          <BridgeForm />
        </section>
      </div>
    </div>
  );
}
