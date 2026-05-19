"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { USDC_ADDRESSES, CHAIN_INFO } from "@/lib/wagmi";
import { BalanceSkeleton } from "./balance-skeleton";

const CHAIN_IDS = Object.keys(USDC_ADDRESSES).map(Number);

export function UsdcBalances() {
  const { address, isConnected } = useAccount();
  const [showZero, setShowZero] = useState(false);

  // Read USDC balance on all testnet chains via multicall.
  // All chains (including Arc) expose ERC20 balanceOf with 6 decimals.
  const {
    data,
    isLoading,
    error,
  } = useReadContracts({
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

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Connect your wallet to see USDC balances</p>
      </div>
    );
  }

  if (isLoading) {
    return <BalanceSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
        <p className="text-red-400">Error loading balances. Check your connection.</p>
      </div>
    );
  }

  // All chains use ERC20 USDC with 6 decimals (CCTP standard).
  const balances = CHAIN_IDS.map((chainId, i) => {
    const result = data?.[i];
    const raw = result?.status === "success" ? (result.result as bigint) : BigInt(0);
    const formatted = parseFloat(formatUnits(raw, 6));
    return { chainId, balance: formatted, info: CHAIN_INFO[chainId] };
  });

  const total = balances.reduce((sum, b) => sum + b.balance, 0);
  const nonZeroBalances = balances.filter((b) => b.balance > 0);
  const zeroCount = balances.length - nonZeroBalances.length;

  // Sort: highest balance first when showing all, otherwise just non-zero
  const visibleBalances = showZero
    ? [...balances].sort((a, b) => b.balance - a.balance)
    : [...nonZeroBalances].sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-4">
      {/* Total card — static gradient, no animation */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900/50 p-6">
        <p className="text-sm text-zinc-400 uppercase tracking-wider">Total USDC (Testnet)</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          ${total.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {nonZeroBalances.length > 0
            ? `${nonZeroBalances.length} chain${nonZeroBalances.length === 1 ? "" : "s"} with balance`
            : `0 of ${balances.length} chains have USDC`}
        </p>
      </div>

      {/* Toggle row */}
      {zeroCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-2.5">
          <span className="text-xs text-zinc-500">
            {showZero
              ? `Showing all ${balances.length} chains`
              : `${zeroCount} chain${zeroCount === 1 ? "" : "s"} with $0.00 hidden`}
          </span>
          <button
            type="button"
            onClick={() => setShowZero((v) => !v)}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showZero ? "Hide zero balances" : "Show all chains"}
          </button>
        </div>
      )}

      {/* Per-chain breakdown */}
      {visibleBalances.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {visibleBalances.map(({ chainId, balance, info }) => (
            <div
              key={chainId}
              className={`rounded-lg border bg-zinc-900/50 p-4 transition-colors ${
                balance > 0
                  ? "border-zinc-800 hover:border-zinc-700"
                  : "border-zinc-800/50 opacity-60 hover:opacity-80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{info.logo}</span>
                <span className="text-sm font-medium text-zinc-300 truncate">{info.name}</span>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {balance.toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500">USDC</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
          <p className="text-zinc-400 text-sm">No USDC balance on any testnet yet.</p>
          <p className="text-zinc-500 text-xs mt-2">
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
    </div>
  );
}
