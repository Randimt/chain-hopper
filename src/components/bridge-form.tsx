"use client";

import { useState, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { sepolia, baseSepolia } from "wagmi/chains";
import { ChainSelector } from "./chain-selector";
import { CHAIN_INFO, USDC_ADDRESSES } from "@/lib/wagmi";

type BridgeStatus =
  | "idle"
  | "approving"
  | "burning"
  | "attesting"
  | "minting"
  | "complete"
  | "error";

export function BridgeForm() {
  const { address, isConnected } = useAccount();
  const [sourceChain, setSourceChain] = useState<number>(sepolia.id);
  const [destChain, setDestChain] = useState<number>(baseSepolia.id);
  const [amount, setAmount] = useState<string>("");
  const [status] = useState<BridgeStatus>("idle");

  // Auto-flip dest if user picks same chain as source
  const handleSourceChange = (chainId: number) => {
    setSourceChain(chainId);
    if (chainId === destChain) {
      // Pick first available chain that's not the new source
      const allChainIds = Object.keys(USDC_ADDRESSES).map(Number);
      const fallback = allChainIds.find((id) => id !== chainId);
      if (fallback) setDestChain(fallback);
    }
  };

  // Read source chain balance for "Max" button + validation
  const { data: balanceRaw } = useReadContract({
    address: USDC_ADDRESSES[sourceChain],
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChain,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  const balance = useMemo(() => {
    if (!balanceRaw) return 0;
    return parseFloat(formatUnits(balanceRaw as bigint, 6));
  }, [balanceRaw]);

  const amountNum = parseFloat(amount) || 0;
  const hasAmount = amountNum > 0;
  const sufficientBalance = amountNum <= balance;

  // Placeholder values (real fee/ETA in Phase 2)
  const feePlaceholder = 0.5;
  const receiveAmount = hasAmount ? Math.max(0, amountNum - feePlaceholder) : 0;
  const etaPlaceholder = "~15 minutes (CCTP V2)";

  const sourceInfo = CHAIN_INFO[sourceChain];
  const destInfo = CHAIN_INFO[destChain];

  // Button state logic
  const canApprove =
    isConnected && hasAmount && sufficientBalance && status === "idle";
  const canBridge = false; // enable after approve (Milestone 2)

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Connect your wallet to start bridging</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
      {/* From Chain */}
      <div className="space-y-3">
        <ChainSelector
          value={sourceChain}
          onChange={handleSourceChange}
          label="From"
        />
        <div className="flex justify-between text-xs text-zinc-500 px-1">
          <span>Balance</span>
          <span className="tabular-nums text-zinc-300">
            {balance.toFixed(2)} USDC
          </span>
        </div>
      </div>

      {/* Visual divider arrow */}
      <div className="flex items-center justify-center -my-3">
        <div className="rounded-full border border-zinc-700 bg-zinc-900 w-8 h-8 flex items-center justify-center text-zinc-400">
          ↓
        </div>
      </div>

      {/* To Chain */}
      <div className="space-y-3">
        <ChainSelector
          value={destChain}
          onChange={setDestChain}
          exclude={sourceChain}
          label="To"
        />
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
          Amount
        </label>
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 pr-20 text-base text-zinc-200 tabular-nums focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setAmount(balance.toString())}
            disabled={balance === 0}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Max
          </button>
        </div>
        {hasAmount && !sufficientBalance && (
          <p className="text-xs text-red-400">Insufficient balance</p>
        )}
      </div>

      {/* Quote Summary */}
      <div className="rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Estimated time</span>
          <span className="text-zinc-300">{etaPlaceholder}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Fee</span>
          <span className="text-zinc-300 tabular-nums">
            ~{feePlaceholder.toFixed(2)} USDC
          </span>
        </div>
        <div className="flex justify-between border-t border-zinc-800 pt-2 mt-2">
          <span className="text-zinc-400 font-medium">You receive</span>
          <span className="text-zinc-100 font-semibold tabular-nums">
            {receiveAmount.toFixed(2)} USDC{" "}
            <span className="text-zinc-500 font-normal text-xs">
              on {destInfo.name}
            </span>
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          disabled={!canApprove}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
        >
          {status === "approving"
            ? "Approving..."
            : `Approve ${sourceInfo.name} USDC`}
        </button>
        <button
          disabled={!canBridge}
          className="w-full rounded-lg bg-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-300 font-medium py-3 px-4 text-sm transition-colors"
        >
          Bridge to {destInfo.name}
        </button>
      </div>

      {/* Phase note */}
      <p className="text-xs text-zinc-600 text-center">
        Phase 1 · CCTP V2 testnet · Real on-chain bridge coming in next update
      </p>
    </div>
  );
}
