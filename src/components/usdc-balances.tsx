"use client";

import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { USDC_ADDRESSES, CHAIN_INFO } from "@/lib/wagmi";

const CHAIN_IDS = Object.keys(USDC_ADDRESSES).map(Number);

export function UsdcBalances() {
  const { address, isConnected } = useAccount();

  // Read USDC balance on all 6 chains in parallel via multicall
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
      refetchInterval: 30_000, // refresh every 30s (less aggressive)
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
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Loading balances...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
        <p className="text-red-400">Error loading balances. Check your connection.</p>
      </div>
    );
  }

  // Calculate total
  const balances = CHAIN_IDS.map((chainId, i) => {
    const result = data?.[i];
    const raw = result?.status === "success" ? (result.result as bigint) : 0n;
    const formatted = parseFloat(formatUnits(raw, 6)); // USDC = 6 decimals
    return { chainId, balance: formatted, info: CHAIN_INFO[chainId] };
  });

  const total = balances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <div className="space-y-4">
      {/* Total card — static gradient, no animation */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900/50 p-6">
        <p className="text-sm text-zinc-400 uppercase tracking-wider">Total USDC</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          ${total.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">across {CHAIN_IDS.length} chains</p>
      </div>

      {/* Per-chain breakdown — hover only, no transitions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {balances.map(({ chainId, balance, info }) => (
          <div
            key={chainId}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{info.logo}</span>
              <span className="text-sm font-medium text-zinc-300">{info.name}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {balance.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-500">USDC</p>
          </div>
        ))}
      </div>
    </div>
  );
}
