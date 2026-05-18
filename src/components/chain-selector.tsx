"use client";

import { CHAIN_INFO, USDC_ADDRESSES } from "@/lib/wagmi";

interface ChainSelectorProps {
  value: number;
  onChange: (chainId: number) => void;
  exclude?: number;
  label?: string;
}

export function ChainSelector({
  value,
  onChange,
  exclude,
  label,
}: ChainSelectorProps) {
  // Bridge form: all CCTP-supported chains (including Arc).
  const availableChainIds = Object.keys(USDC_ADDRESSES)
    .map(Number)
    .filter((id) => {
      if (exclude && id === exclude) return false;
      return true;
    });

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
      >
        {availableChainIds.map((chainId) => {
          const info = CHAIN_INFO[chainId];
          return (
            <option key={chainId} value={chainId}>
              {info.logo} {info.name}
            </option>
          );
        })}
      </select>
    </div>
  );
}
