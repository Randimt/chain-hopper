"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { USDC_ADDRESSES, CHAIN_INFO } from "@/lib/wagmi";
import { BalanceSkeleton } from "./balance-skeleton";

const CHAIN_IDS = Object.keys(USDC_ADDRESSES).map(Number);

/**
 * Compact balance list for Bridge page sidebar.
 * Click a chain row to set it as the bridge source chain.
 * Emits "plix:set-source-chain" custom event with chainId in detail.
 */
export function UsdcBalancesCompact() {
  const { address, isConnected } = useAccount();
  const [showZero, setShowZero] = useState(false);

  const { data, isLoading, error } = useReadContracts({
    contracts: CHAIN_IDS.map((chainId) => ({
      address: USDC_ADDRESSES[chainId],
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address!],
      chainId,
    })),
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  const handleSelectChain = (chainId: number) => {
    window.dispatchEvent(
      new CustomEvent("plix:set-source-chain", { detail: { chainId } })
    );
  };

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-400">Connect wallet to see balances</p>
      </div>
    );
  }

  if (isLoading) {
    return <BalanceSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-400">Error loading balances</p>
      </div>
    );
  }

  const balances = CHAIN_IDS.map((chainId, i) => {
    const result = data?.[i];
    const raw = result?.status === "success" ? (result.result as bigint) : BigInt(0);
    const formatted = parseFloat(formatUnits(raw, 6));
    return { chainId, balance: formatted, info: CHAIN_INFO[chainId] };
  });

  const total = balances.reduce((sum, b) => sum + b.balance, 0);
  const nonZero = balances.filter((b) => b.balance > 0);
  const zeroCount = balances.length - nonZero.length;

  const visible = showZero
    ? [...balances].sort((a, b) => b.balance - a.balance)
    : [...nonZero].sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900/50 p-5">
        <p className="text-xs uppercase tracking-wider text-zinc-400">Your USDC Holdings</p>
        <p className="mt-1.5 text-2xl font-bold tabular-nums">${total.toFixed(2)}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {nonZero.length > 0
            ? `${nonZero.length} chain${nonZero.length === 1 ? "" : "s"} with balance`
            : `0 of ${balances.length} chains`}
        </p>
      </div>

      {/* Chain list */}
      {visible.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
          {visible.map(({ chainId, balance, info }, i) => (
            <button
              key={chainId}
              type="button"
              onClick={() => handleSelectChain(chainId)}
              className={`group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                i > 0 ? "border-t border-zinc-800/50" : ""
              } ${
                balance > 0
                  ? "hover:bg-zinc-800/50"
                  : "opacity-50 hover:opacity-80 hover:bg-zinc-800/30"
              }`}
              title={`Set ${info.name} as source chain`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-base shrink-0">{info.logo}</span>
                <span className="text-sm font-medium text-zinc-300 truncate">{info.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums text-zinc-200">
                  {balance.toFixed(2)}
                </span>
                <svg
                  className="h-3.5 w-3.5 text-zinc-600 group-hover:text-cyan-400 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center">
          <p className="text-sm text-zinc-400">No USDC balance yet.</p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Get testnet USDC from{" "}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              faucet.circle.com
            </a>
          </p>
        </div>
      )}

      {/* Toggle zero */}
      {zeroCount > 0 && (
        <button
          type="button"
          onClick={() => setShowZero((v) => !v)}
          className="w-full rounded-lg border border-zinc-800/50 bg-zinc-900/20 px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
        >
          {showZero
            ? "Hide zero balances"
            : `+ ${zeroCount} chain${zeroCount === 1 ? "" : "s"} with $0.00`}
        </button>
      )}
    </div>
  );
}
