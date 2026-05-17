"use client";

import { useState, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { sepolia, baseSepolia } from "wagmi/chains";
import { ChainSelector } from "./chain-selector";
import { CHAIN_INFO, USDC_ADDRESSES } from "@/lib/wagmi";
import { useBridge } from "@/hooks/useBridge";

export function BridgeForm() {
  const { address, isConnected } = useAccount();
  const [sourceChain, setSourceChain] = useState<number>(sepolia.id);
  const [destChain, setDestChain] = useState<number>(baseSepolia.id);
  const [amount, setAmount] = useState<string>("");
  const { state, approve, bridge, reset } = useBridge();

  // Auto-flip dest if user picks same chain as source
  const handleSourceChange = (chainId: number) => {
    setSourceChain(chainId);
    if (chainId === destChain) {
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

  const feePlaceholder = 0.5;
  const receiveAmount = hasAmount ? Math.max(0, amountNum - feePlaceholder) : 0;
  const etaPlaceholder = "~30 seconds (CCTP V2 Fast)";

  const sourceInfo = CHAIN_INFO[sourceChain];
  const destInfo = CHAIN_INFO[destChain];

  // Button state derived from bridge hook status
  const status = state.status;
  const isApproving = status === "approving";
  const isApproved = status === "approved";
  const isBridging = ["burning", "attesting", "minting"].includes(status);
  const isComplete = status === "complete";
  const hasError = status === "error";

  const canApprove =
    isConnected &&
    hasAmount &&
    sufficientBalance &&
    (status === "idle" || hasError);
  const canBridge = isApproved && hasAmount && sufficientBalance;

  const handleApprove = () => approve({ sourceChain });
  const handleBridge = () => bridge({ sourceChain, destChain, amount });

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
            disabled={isBridging || isApproving}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 pr-20 text-base text-zinc-200 tabular-nums focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => setAmount(balance.toString())}
            disabled={balance === 0 || isBridging || isApproving}
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
          <span className="text-zinc-500">Max fee</span>
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

      {/* Status messages */}
      {status === "approving" && (
        <div className="text-xs text-blue-400 text-center">
          ⏳ Approving USDC on {sourceInfo.name}...
        </div>
      )}
      {status === "approved" && (
        <div className="text-xs text-green-400 text-center">
          ✓ Approved. Click &quot;Bridge&quot; to continue.
        </div>
      )}
      {status === "burning" && (
        <div className="text-xs text-blue-400 text-center">
          ⏳ Burning USDC on {sourceInfo.name}...
        </div>
      )}
      {status === "attesting" && (
        <div className="text-xs text-blue-400 text-center">
          ⏳ Waiting for Circle attestation
          {state.attestationStatus && ` (${state.attestationStatus})`}...
        </div>
      )}
      {status === "minting" && (
        <div className="text-xs text-blue-400 text-center">
          ⏳ Minting USDC on {destInfo.name}...
        </div>
      )}
      {status === "complete" && (
        <div className="text-xs text-green-400 text-center">
          ✓ Bridge complete! USDC minted on {destInfo.name}.
        </div>
      )}
      {status === "error" && state.errorMessage && (
        <div className="text-xs text-red-400 text-center break-words">
          ⚠ {state.errorMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {!isComplete ? (
          <>
            <button
              onClick={handleApprove}
              disabled={!canApprove}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
            >
              {isApproving
                ? "Approving..."
                : isApproved
                ? `✓ Approved`
                : `Approve ${sourceInfo.name} USDC`}
            </button>
            <button
              onClick={handleBridge}
              disabled={!canBridge || isBridging}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
            >
              {isBridging
                ? status === "burning"
                  ? "Burning..."
                  : status === "attesting"
                  ? "Waiting for attestation..."
                  : "Minting..."
                : `Bridge to ${destInfo.name}`}
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              reset();
              setAmount("");
            }}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 text-sm transition-colors"
          >
            Bridge Again
          </button>
        )}
      </div>

      {/* Tx hash links */}
      {(state.approveTxHash || state.burnTxHash || state.mintTxHash) && (
        <div className="text-xs text-zinc-500 space-y-1 pt-2 border-t border-zinc-800/50">
          {state.approveTxHash && (
            <p className="truncate">
              Approve:{" "}
              <span className="text-zinc-400 font-mono">
                {state.approveTxHash.slice(0, 10)}...{state.approveTxHash.slice(-8)}
              </span>
            </p>
          )}
          {state.burnTxHash && (
            <p className="truncate">
              Burn:{" "}
              <span className="text-zinc-400 font-mono">
                {state.burnTxHash.slice(0, 10)}...{state.burnTxHash.slice(-8)}
              </span>
            </p>
          )}
          {state.mintTxHash && (
            <p className="truncate">
              Mint:{" "}
              <span className="text-zinc-400 font-mono">
                {state.mintTxHash.slice(0, 10)}...{state.mintTxHash.slice(-8)}
              </span>
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-600 text-center">
        Phase 1 · CCTP V2 testnet · Fast Transfer enabled
      </p>
    </div>
  );
}
