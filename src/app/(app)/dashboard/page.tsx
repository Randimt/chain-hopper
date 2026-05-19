"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { CHAIN_INFO, USDC_ADDRESSES } from "@/lib/wagmi";
import { loadBridgeHistory, type BridgeRecord } from "@/lib/bridge-history";
import { SolanaBalanceRow } from "@/components/solana-balance-row";

function StatCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-bold tabular-nums">{value}</div>
      {meta && <div className="text-xs text-emerald-400 mt-1.5">{meta}</div>}
    </div>
  );
}

function shortHash(hash: `0x${string}`) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [history, setHistory] = useState<BridgeRecord[]>([]);
  const [showZero, setShowZero] = useState(false);

  // Refresh on mount + listen for updates
  useEffect(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    const refresh = () => {
      const records = loadBridgeHistory(address);
      setHistory(records.sort((a, b) => b.startedAt - a.startedAt));
    };
    refresh();
    window.addEventListener("bridge-history-updated", refresh);
    return () => window.removeEventListener("bridge-history-updated", refresh);
  }, [address]);

  // Read USDC balances across all chains
  const chainIds = Object.keys(USDC_ADDRESSES).map(Number);
  const { data: balanceData } = useReadContracts({
    contracts: chainIds.map((chainId) => ({
      address: USDC_ADDRESSES[chainId],
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId,
    })),
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  const balances = useMemo(() => {
    if (!balanceData) return [];
    return chainIds
      .map((chainId, i) => {
        const result = balanceData[i];
        const raw =
          result?.status === "success" ? (result.result as bigint) : BigInt(0);
        const amount = parseFloat(formatUnits(raw, 6));
        return { chainId, amount, info: CHAIN_INFO[chainId] };
      })
      .filter((b) => b.info)
      .sort((a, b) => b.amount - a.amount);
  }, [balanceData, chainIds]);

  const totalUsdc = balances.reduce((sum, b) => sum + b.amount, 0);
  const nonZeroBalances = balances.filter((b) => b.amount > 0);
  const zeroCount = balances.length - nonZeroBalances.length;
  const visibleBalances = showZero ? balances : nonZeroBalances;
  const stats = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const todayBridges = history.filter((r) => r.startedAt > oneDayAgo);
    const weekBridges = history.filter((r) => r.startedAt > sevenDaysAgo);
    const completedBridges = history.filter((r) => r.status === "complete");
    const completedDurations = completedBridges
      .filter((r) => r.completedAt)
      .map((r) => (r.completedAt! - r.startedAt) / 1000);
    const avgDuration =
      completedDurations.length > 0
        ? completedDurations.reduce((a, b) => a + b, 0) /
          completedDurations.length
        : 0;
    const weekVolume = weekBridges
      .filter((r) => r.status === "complete")
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    return {
      todayCount: todayBridges.length,
      todaySuccess: todayBridges.filter((r) => r.status === "complete").length,
      weekVolume,
      avgDurationSec: Math.round(avgDuration),
    };
  }, [history]);

  const recentActivity = history.slice(0, 4);

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">👋</div>
          <h1 className="text-3xl font-bold mb-2">Welcome to Plix</h1>
          <p className="text-zinc-400 max-w-md mx-auto mb-8">
            Connect your wallet to view USDC across testnets and bridge between
            them via Circle CCTP V2.
          </p>
          <Link
            href="/bridge"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Get started →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-zinc-500 text-sm">
          Your USDC overview across testnets
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard
          label="Total USDC"
          value={totalUsdc.toFixed(2)}
          meta={`across ${balances.filter((b) => b.amount > 0).length} chains`}
        />
        <StatCard
          label="Bridges Today"
          value={stats.todayCount.toString()}
          meta={
            stats.todayCount > 0
              ? `${stats.todaySuccess} successful`
              : "no activity"
          }
        />
        <StatCard
          label="Volume (7d)"
          value={`$${stats.weekVolume.toFixed(2)}`}
          meta="USDC bridged"
        />
        <StatCard
          label="Avg Bridge Time"
          value={
            stats.avgDurationSec > 0
              ? stats.avgDurationSec < 60
                ? `${stats.avgDurationSec}s`
                : `${Math.floor(stats.avgDurationSec / 60)}m ${stats.avgDurationSec % 60}s`
              : "—"
          }
          meta={stats.avgDurationSec > 0 ? "CCTP V2" : "no completed yet"}
        />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Holdings */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
              Your Holdings
            </span>
            <Link
              href="/bridge"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Bridge →
            </Link>
          </div>

          {/* Solana view-only row */}
          <SolanaBalanceRow />

          {balances.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-500">
              Loading balances...
            </div>
          ) : visibleBalances.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400">No USDC balance yet</p>
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 text-xs mt-2 inline-block"
              >
                Get from faucet ↗
              </a>
            </div>
          ) : (
            <div className="space-y-1">
              {visibleBalances.map((b) => {
                const pct =
                  totalUsdc > 0 ? Math.round((b.amount / totalUsdc) * 100) : 0;
                return (
                  <div
                    key={b.chainId}
                    className={`flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0 transition-opacity ${
                      b.amount === 0 ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{b.info.logo}</span>
                      <div>
                        <div className="text-sm">{b.info.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {b.amount > 0 ? `${pct}% of total` : "no balance"}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      {b.amount.toFixed(2)} USDC
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {zeroCount > 0 && balances.length > 0 && (
            <button
              type="button"
              onClick={() => setShowZero((v) => !v)}
              className="w-full mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showZero
                ? "Hide zero balances"
                : `+ ${zeroCount} chain${zeroCount === 1 ? "" : "s"} with $0.00`}
            </button>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
              Recent Activity
            </span>
            <Link
              href="/history"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              See all →
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-500">
              <p>No bridges yet</p>
              <Link
                href="/bridge"
                className="text-cyan-400 hover:text-cyan-300 text-xs mt-2 inline-block"
              >
                Make your first bridge →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((record) => {
                const sourceInfo = CHAIN_INFO[record.sourceChain];
                const destInfo = CHAIN_INFO[record.destChain];
                return (
                  <Link
                    key={record.id}
                    href="/history"
                    className="flex items-center justify-between p-3 bg-zinc-950/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm flex items-center gap-1.5 truncate">
                        <span>{sourceInfo?.logo}</span>
                        <span className="text-zinc-300 truncate">
                          {sourceInfo?.name}
                        </span>
                        <span className="text-zinc-600">→</span>
                        <span>{destInfo?.logo}</span>
                        <span className="text-zinc-300 truncate">
                          {destInfo?.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {formatRelativeTime(record.startedAt)} ·{" "}
                        {record.provider.toUpperCase()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-sm tabular-nums">
                        {parseFloat(record.amount).toFixed(2)}
                      </span>
                      {record.status === "complete" ? (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full w-6 h-6 flex items-center justify-center">
                          ✓
                        </span>
                      ) : (
                        <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-full w-6 h-6 flex items-center justify-center">
                          ✗
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
        <Link
          href="/bridge"
          className="bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 rounded-xl p-5 hover:border-cyan-500/40 transition-colors"
        >
          <div className="text-2xl mb-2">🌉</div>
          <div className="font-semibold text-sm mb-1">Bridge USDC</div>
          <div className="text-[11px] text-zinc-500">Cross-chain via CCTP</div>
        </Link>
        <Link
          href="/history"
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
        >
          <div className="text-2xl mb-2">📜</div>
          <div className="font-semibold text-sm mb-1">View History</div>
          <div className="text-[11px] text-zinc-500">
            {history.length} transactions
          </div>
        </Link>
        <a
          href="https://faucet.circle.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
        >
          <div className="text-2xl mb-2">💧</div>
          <div className="font-semibold text-sm mb-1">Get Testnet USDC</div>
          <div className="text-[11px] text-zinc-500">Circle Faucet ↗</div>
        </a>
      </div>
    </div>
  );
}
