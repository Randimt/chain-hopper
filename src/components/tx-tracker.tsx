"use client";

import { useEffect, useState } from "react";
import type { BridgeState } from "@/hooks/useBridge";
import { CHAIN_INFO } from "@/lib/wagmi";

interface TxTrackerProps {
  state: BridgeState;
  sourceChain: number;
  destChain: number;
  onClose?: () => void;
}

type StepKey = "approve" | "burn" | "attest" | "mint";

interface Step {
  key: StepKey;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { key: "approve", label: "Approve", description: "Allow CCTP to spend USDC" },
  { key: "burn", label: "Burn", description: "Burn USDC on source chain" },
  { key: "attest", label: "Attest", description: "Wait for Circle signature" },
  { key: "mint", label: "Mint", description: "Mint USDC on destination" },
];

function getStepStatus(
  stepKey: StepKey,
  state: BridgeState
): "pending" | "active" | "complete" | "error" {
  const status = state.status;

  if (status === "error") {
    // Find the highest-progressed step and mark it as errored
    if (state.mintTxHash) return stepKey === "mint" ? "error" : "complete";
    if (state.burnTxHash) {
      if (stepKey === "approve" || stepKey === "burn") return "complete";
      if (stepKey === "attest") return "error";
      return "pending";
    }
    if (state.approveTxHash) {
      if (stepKey === "approve") return "complete";
      if (stepKey === "burn") return "error";
      return "pending";
    }
    return stepKey === "approve" ? "error" : "pending";
  }

  // Approve step
  if (stepKey === "approve") {
    if (status === "approving") return "active";
    if (state.approveTxHash) return "complete";
    return "pending";
  }
  // Burn step
  if (stepKey === "burn") {
    if (status === "burning") return "active";
    if (state.burnTxHash) return "complete";
    return "pending";
  }
  // Attest step
  if (stepKey === "attest") {
    if (status === "attesting") return "active";
    if (state.mintTxHash || status === "minting" || status === "complete") return "complete";
    return "pending";
  }
  // Mint step
  if (stepKey === "mint") {
    if (status === "minting") return "active";
    if (status === "complete") return "complete";
    return "pending";
  }

  return "pending";
}

function StepIcon({ status }: { status: "pending" | "active" | "complete" | "error" }) {
  if (status === "complete") {
    return (
      <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white text-xs">
        ✓
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    );
  }
  if (status === "error") {
    return (
      <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white text-xs">
        ✕
      </div>
    );
  }
  // pending
  return (
    <div className="w-6 h-6 rounded-full border border-zinc-700 bg-zinc-900" />
  );
}

function shortHash(hash: `0x${string}`) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function TxTracker({
  state,
  sourceChain,
  destChain,
  onClose,
}: TxTrackerProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Auto-show on activity, allow user collapse
  const isActive = ["approving", "burning", "attesting", "minting"].includes(state.status);
  const isDone = state.status === "complete";
  const isError = state.status === "error";

  // Hide entirely when idle or approved (no tx in flight yet)
  useEffect(() => {
    if (state.status === "idle") setCollapsed(false);
  }, [state.status]);

  if (state.status === "idle" || state.status === "approved") return null;

  const sourceInfo = CHAIN_INFO[sourceChain];
  const destInfo = CHAIN_INFO[destChain];

  const txHashFor = (key: StepKey) => {
    if (key === "approve") return state.approveTxHash;
    if (key === "burn") return state.burnTxHash;
    if (key === "mint") return state.mintTxHash;
    return undefined;
  };

  const explorerFor = (key: StepKey) => {
    const chainId = key === "mint" ? destChain : sourceChain;
    return CHAIN_INFO[chainId]?.explorer;
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-zinc-900 border border-zinc-700 px-4 py-2 text-xs text-zinc-200 shadow-lg hover:border-zinc-600 flex items-center gap-2"
      >
        {isActive && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
        {isDone && <span className="w-2 h-2 rounded-full bg-green-500" />}
        {isError && <span className="w-2 h-2 rounded-full bg-red-500" />}
        <span>
          {isActive && "Bridging..."}
          {isDone && "Bridge complete"}
          {isError && "Bridge error"}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {isDone ? "Bridge complete" : isError ? "Bridge error" : "Bridging USDC"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {sourceInfo?.logo} {sourceInfo?.name} → {destInfo?.logo} {destInfo?.name}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            className="text-zinc-500 hover:text-zinc-300 px-2 py-1 text-xs"
            aria-label="Collapse"
          >
            –
          </button>
          {(isDone || isError) && onClose && (
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 px-2 py-1 text-xs"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {STEPS.map((step) => {
          const status = getStepStatus(step.key, state);
          const hash = txHashFor(step.key);
          const explorer = explorerFor(step.key);
          const txt = status === "active" ? "text-blue-400" : status === "complete" ? "text-green-400" : status === "error" ? "text-red-400" : "text-zinc-500";

          return (
            <li key={step.key} className="flex items-start gap-3">
              <div className="pt-0.5">
                <StepIcon status={status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${txt}`}>{step.label}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {step.key === "attest" && status === "active" && state.attestationStatus
                    ? `Waiting (${state.attestationStatus})...`
                    : step.description}
                </p>
                {hash && explorer && (
                  <a
                    href={`${explorer}/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 hover:underline font-mono"
                  >
                    {shortHash(hash)} ↗
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Error message */}
      {isError && state.errorMessage && (
        <p className="mt-3 text-[11px] text-red-400 break-words">
          {state.errorMessage}
        </p>
      )}
    </div>
  );
}
