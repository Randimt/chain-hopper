"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { CHAIN_INFO } from "@/lib/wagmi";
import {
  loadBridgeHistory,
  clearBridgeHistory,
  type BridgeRecord,
  type BridgeStatus,
} from "@/lib/bridge-history";

function shortHash(hash: `0x${string}`) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
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

function formatDuration(start: number, end?: number): string {
  if (!end) return "—";
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function StatusBadge({ status }: { status: BridgeStatus }) {
  const config = {
    complete: { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", label: "Complete" },
    failed: { color: "text-red-400 bg-red-500/10 border-red-500/30", label: "Failed" },
    pending: { color: "text-amber-400 bg-amber-500/10 border-amber-500/30", label: "Pending" },
  };
  const c = config[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function ChainBadge({ chainId }: { chainId: number }) {
  const info = CHAIN_INFO[chainId];
  if (!info) return <span className="text-zinc-500">Unknown</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-base">{info.logo}</span>
      <span className="text-zinc-300">{info.name}</span>
    </span>
  );
}

function HistoryItem({ record }: { record: BridgeRecord }) {
  const [expanded, setExpanded] = useState(false);

  const sourceExplorer = CHAIN_INFO[record.sourceChain]?.explorer;
  const destExplorer = CHAIN_INFO[record.destChain]?.explorer;
  const isRecipe = !!record.recipeId;

  return (
    <div className={`rounded-lg border bg-zinc-950/50 overflow-hidden ${isRecipe ? "border-purple-500/20" : "border-zinc-800"}`}>
      {/* Recipe context header (if applicable) */}
      {isRecipe && (
        <div className="px-3 py-1.5 bg-gradient-to-r from-purple-500/[0.08] to-pink-500/[0.05] border-b border-purple-500/10 flex items-center gap-2 text-[11px]">
          <span className="text-purple-400">🍳</span>
          <span className="text-purple-300 font-medium truncate">
            {record.recipeName || "Recipe run"}
          </span>
          {record.recipeOutputIndex !== undefined && record.recipeTotalOutputs !== undefined && (
            <span className="text-zinc-500 shrink-0">
              · output {record.recipeOutputIndex + 1} of {record.recipeTotalOutputs}
            </span>
          )}
        </div>
      )}

      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <ChainBadge chainId={record.sourceChain} />
            <span className="text-zinc-600">→</span>
            <ChainBadge chainId={record.destChain} />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm tabular-nums text-zinc-300">
            {parseFloat(record.amount).toFixed(2)} USDC
          </span>
          <StatusBadge status={record.status} />
          <span className="text-xs text-zinc-500 whitespace-nowrap hidden sm:inline">
            {formatRelativeTime(record.startedAt)}
          </span>
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-2 bg-zinc-950">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Provider:</span>{" "}
              <span className="text-zinc-300 uppercase">{record.provider}</span>
            </div>
            <div>
              <span className="text-zinc-500">Duration:</span>{" "}
              <span className="text-zinc-300 tabular-nums">
                {formatDuration(record.startedAt, record.completedAt)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Started:</span>{" "}
              <span className="text-zinc-300">
                {new Date(record.startedAt).toLocaleString()}
              </span>
            </div>
            {record.completedAt && (
              <div>
                <span className="text-zinc-500">Completed:</span>{" "}
                <span className="text-zinc-300">
                  {new Date(record.completedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Tx links */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            {record.approveTxHash && sourceExplorer && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 w-16">Approve:</span>
                <a
                  href={`${sourceExplorer}/tx/${record.approveTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                >
                  {shortHash(record.approveTxHash)} ↗
                </a>
              </div>
            )}
            {record.burnTxHash && sourceExplorer && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 w-16">Burn:</span>
                <a
                  href={`${sourceExplorer}/tx/${record.burnTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                >
                  {shortHash(record.burnTxHash)} ↗
                </a>
              </div>
            )}
            {record.mintTxHash && destExplorer && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 w-16">Mint:</span>
                <a
                  href={`${destExplorer}/tx/${record.mintTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                >
                  {shortHash(record.mintTxHash)} ↗
                </a>
              </div>
            )}
          </div>

          {/* Error message */}
          {record.errorMessage && (
            <div className="pt-2 border-t border-zinc-800">
              <span className="text-xs text-red-400">{record.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type FilterType = "all" | "complete" | "failed" | "recipes";

export function BridgeHistory() {
  const { address, isConnected } = useAccount();
  const [history, setHistory] = useState<BridgeRecord[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");

  // Load history on mount + listen for updates
  useEffect(() => {
    if (!address) {
      setHistory([]);
      return;
    }

    const refresh = () => {
      const records = loadBridgeHistory(address);
      // Sort newest first
      setHistory(records.sort((a, b) => b.startedAt - a.startedAt));
    };

    refresh();
    window.addEventListener("bridge-history-updated", refresh);
    return () => window.removeEventListener("bridge-history-updated", refresh);
  }, [address]);

  const filtered = useMemo(() => {
    if (filter === "all") return history;
    if (filter === "recipes") return history.filter((r) => !!r.recipeId);
    return history.filter((r) => r.status === filter);
  }, [history, filter]);

  const stats = useMemo(() => {
    const total = history.length;
    const complete = history.filter((r) => r.status === "complete").length;
    const failed = history.filter((r) => r.status === "failed").length;
    const recipes = history.filter((r) => !!r.recipeId).length;
    return { total, complete, failed, recipes };
  }, [history]);

  const handleClear = () => {
    if (!address) return;
    if (!confirm("Clear all bridge history? This cannot be undone.")) return;
    clearBridgeHistory(address);
    setHistory([]);
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Bridge History</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {stats.total > 0
              ? `${stats.total} total · ${stats.complete} complete · ${stats.failed} failed`
              : "Your past bridges will appear here"}
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter tabs */}
      {history.length > 0 && (
        <div className="flex gap-2 text-xs">
          {(["all", "complete", "failed", "recipes"] as FilterType[]).map((f) => {
            const count =
              f === "all"
                ? stats.total
                : f === "complete"
                ? stats.complete
                : f === "failed"
                ? stats.failed
                : stats.recipes;
            // Hide "recipes" tab if no recipe runs yet
            if (f === "recipes" && stats.recipes === 0) return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full border transition-colors capitalize ${
                  filter === f
                    ? f === "recipes"
                      ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                      : "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f === "recipes" ? "🍳 Recipes" : f} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && (
        <div className="py-8 text-center text-zinc-500 text-sm">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-zinc-700"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p>No bridges yet</p>
          <p className="text-xs mt-1">Complete your first bridge to see it here</p>
        </div>
      )}

      {/* Filtered empty state */}
      {history.length > 0 && filtered.length === 0 && (
        <div className="py-6 text-center text-zinc-500 text-sm">
          No {filter} bridges
        </div>
      )}

      {/* Records list */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((record) => (
            <HistoryItem key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}
