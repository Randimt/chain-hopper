"use client";

import {
  CHAIN_INFO,
  USDC_ADDRESSES,
  SOLANA_DEVNET_CHAIN_ID,
  type ChainType,
} from "@/lib/wagmi";

interface ChainSelectorProps {
  value: number;
  onChange: (chainId: number) => void;
  exclude?: number;
  label?: string;
  /** When true, Solana Devnet is selectable (used for destination only). */
  allowSolana?: boolean;
  /**
   * Restrict the picker to only this set of chain IDs. When provided, every
   * other chain (EVM or coming-soon) is hidden from the dropdown. Used by
   * Recipes (Phase 4 batch mode) to limit source to deployed Splitter chains.
   */
  onlyChainIds?: number[];
}

const TYPE_BADGE_STYLE: Record<ChainType, string> = {
  L1: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  L2: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  EVM: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  "Cosmos+EVM": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Solana: "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

export function ChainSelector({
  value,
  onChange,
  exclude,
  label,
  allowSolana = false,
  onlyChainIds,
}: ChainSelectorProps) {
  const onlySet = onlyChainIds ? new Set(onlyChainIds) : null;
  const passesOnly = (id: number) => !onlySet || onlySet.has(id);

  // Active EVM chains (CCTP-supported)
  const evmChainIds = Object.keys(USDC_ADDRESSES)
    .map(Number)
    .filter((id) => !exclude || id !== exclude)
    .filter(passesOnly);

  // Coming-soon chains (Solana etc) — visible but disabled, unless allowSolana flips Solana enabled
  const comingSoonIds = Object.entries(CHAIN_INFO)
    .filter(([, info]) => info.comingSoon)
    .map(([id]) => Number(id))
    .filter((id) => !exclude || id !== exclude)
    .filter(passesOnly);

  const selectedInfo = CHAIN_INFO[value];

  // Solana is "enabled" when allowSolana is true. Other comingSoon chains stay disabled.
  const isComingSoonEnabled = (chainId: number) => {
    if (!CHAIN_INFO[chainId]?.comingSoon) return true;
    return allowSolana && chainId === SOLANA_DEVNET_CHAIN_ID;
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          // Block selecting a still-disabled comingSoon chain
          if (CHAIN_INFO[next]?.comingSoon && !isComingSoonEnabled(next)) return;
          onChange(next);
        }}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none cursor-pointer"
      >
        {evmChainIds.map((chainId) => {
          const info = CHAIN_INFO[chainId];
          return (
            <option key={chainId} value={chainId}>
              {info.logo} {info.name} · {info.type}
            </option>
          );
        })}
        {comingSoonIds.length > 0 && (
          <optgroup
            label={
              allowSolana
                ? "── Cross-VM (beta) ──"
                : "── Coming Soon ──"
            }
          >
            {comingSoonIds.map((chainId) => {
              const info = CHAIN_INFO[chainId];
              const enabled = isComingSoonEnabled(chainId);
              return (
                <option
                  key={chainId}
                  value={chainId}
                  disabled={!enabled}
                >
                  {info.logo} {info.name} · {info.type}
                  {enabled ? " — Beta" : " — Coming Soon"}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>

      {selectedInfo && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium ${
              TYPE_BADGE_STYLE[selectedInfo.type]
            }`}
            title={selectedInfo.typeNote}
          >
            {selectedInfo.type}
          </span>
          {selectedInfo.comingSoon && allowSolana && value === SOLANA_DEVNET_CHAIN_ID && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium bg-purple-500/10 text-purple-400 border-purple-500/30">
              Beta · Connect Phantom
            </span>
          )}
          {selectedInfo.comingSoon && !(allowSolana && value === SOLANA_DEVNET_CHAIN_ID) && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium bg-purple-500/10 text-purple-400 border-purple-500/30">
              Coming Soon
            </span>
          )}
          {selectedInfo.typeNote && (
            <span className="text-[11px] text-amber-400/80 leading-tight">
              ⚠ {selectedInfo.typeNote}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { SOLANA_DEVNET_CHAIN_ID };
