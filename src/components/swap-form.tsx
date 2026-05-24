"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import toast from "react-hot-toast";
import {
  useCircleSwap,
  type SwapToken,
  type CircleSwapStep,
} from "@/hooks/useCircleSwap";
import { CHAIN_INFO } from "@/lib/wagmi";

// Arc Testnet chain id (matches mapping in useCircleBridge + Circle SDK)
const ARC_TESTNET_CHAIN_ID = 5042002;

// Tokens supported by Circle Swap on Arc Testnet (per docs.arc.io/app-kit/swap)
// Addresses confirmed via testnet.arcscan.app + docs.arc.io.
const SUPPORTED_TOKENS: SwapToken[] = ["USDC", "EURC", "cirBTC"];

const TOKEN_DECIMALS: Record<SwapToken, number> = {
  USDC: 6,
  EURC: 6,
  cirBTC: 8,
};

const TOKEN_LABELS: Record<SwapToken, { symbol: string; name: string; emoji: string }> = {
  USDC: { symbol: "USDC", name: "USD Coin", emoji: "💵" },
  EURC: { symbol: "EURC", name: "Euro Coin", emoji: "💶" },
  cirBTC: { symbol: "cirBTC", name: "Circle BTC", emoji: "₿" },
};

// Token addresses on Arc Testnet
//   USDC:   docs.arc.io/arc/references/contract-addresses (native ERC-20 interface)
//   EURC:   docs.arc.io/arc/references/contract-addresses
//   cirBTC: testnet.arcscan.app/token/0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
const TOKEN_ADDRESSES_ARC: Partial<Record<SwapToken, `0x${string}`>> = {
  USDC: "0x3600000000000000000000000000000000000000",
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
};

function shortHash(hash: string) {
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

interface TokenSelectorProps {
  value: SwapToken;
  onChange: (token: SwapToken) => void;
  excluded?: SwapToken;
  label: string;
}

function TokenSelector({ value, onChange, excluded, label }: TokenSelectorProps) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {SUPPORTED_TOKENS.map((token) => {
          const disabled = token === excluded;
          const active = token === value;
          const meta = TOKEN_LABELS[token];
          return (
            <button
              key={token}
              type="button"
              disabled={disabled}
              onClick={() => onChange(token)}
              className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-sm font-medium transition-all ${
                active
                  ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-100"
                  : disabled
                    ? "bg-zinc-900/30 border-zinc-800/50 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-900/60 hover:border-zinc-700"
              }`}
            >
              <span className="text-xl">{meta.emoji}</span>
              <span className="leading-none">{meta.symbol}</span>
              <span className="text-[10px] text-zinc-500 leading-none">{meta.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TokenBalanceProps {
  token: SwapToken;
  chainId: number;
}

function TokenBalance({ token, chainId }: TokenBalanceProps) {
  const { address } = useAccount();
  const tokenAddress = TOKEN_ADDRESSES_ARC[token];

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: Boolean(address && tokenAddress && chainId === ARC_TESTNET_CHAIN_ID),
      refetchInterval: 15000,
    },
  });

  if (!tokenAddress) {
    return <span className="text-[11px] text-zinc-500">balance unknown</span>;
  }

  if (balance === undefined) {
    return <span className="text-[11px] text-zinc-500">loading...</span>;
  }

  const formatted = formatUnits(balance, TOKEN_DECIMALS[token]);
  return <span className="text-[11px] text-zinc-400">{formatted} {token}</span>;
}

export function SwapForm() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [tokenIn, setTokenIn] = useState<SwapToken>("USDC");
  const [tokenOut, setTokenOut] = useState<SwapToken>("EURC");
  const [amountIn, setAmountIn] = useState("");

  const swapHook = useCircleSwap();
  const { swap, status, steps, error, estimatedOut, reset, estimate } = swapHook;

  const onArcTestnet = chainId === ARC_TESTNET_CHAIN_ID;
  const arcChainName = CHAIN_INFO[ARC_TESTNET_CHAIN_ID]?.name ?? "Arc Testnet";

  // Live quote — debounced re-fetch when inputs change
  const [liveQuote, setLiveQuote] = useState<{
    estimatedOut?: string;
    minOut?: string;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    // Skip while a swap is mid-flight (avoids duplicate API calls)
    if (status === "preparing" || status === "swapping") return;
    if (!isConnected || !onArcTestnet) {
      setLiveQuote(null);
      return;
    }
    if (!amountIn || Number(amountIn) <= 0) {
      setLiveQuote(null);
      return;
    }
    if (tokenIn === tokenOut) {
      setLiveQuote(null);
      return;
    }

    // Debounce 500ms — ride out fast typing
    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const result = await estimate({
          chainId: ARC_TESTNET_CHAIN_ID,
          tokenIn,
          tokenOut,
          amountIn,
        });
        setLiveQuote(
          result
            ? { estimatedOut: result.estimatedOut, minOut: result.minOut }
            : null,
        );
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
    // estimate is referentially stable per connector — exclude from deps to prevent loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenIn, tokenOut, amountIn, isConnected, onArcTestnet, status]);

  const canSwap = useMemo(() => {
    return (
      isConnected &&
      onArcTestnet &&
      tokenIn !== tokenOut &&
      Number(amountIn) > 0 &&
      status !== "preparing" &&
      status !== "swapping"
    );
  }, [isConnected, onArcTestnet, tokenIn, tokenOut, amountIn, status]);

  const handleFlip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
  };

  const handleSwap = async () => {
    if (!canSwap) return;
    try {
      await swap({
        chainId: ARC_TESTNET_CHAIN_ID,
        tokenIn,
        tokenOut,
        amountIn,
      });
      toast.success("Swap submitted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.slice(0, 120));
    }
  };

  const handleSwitchToArc = async () => {
    try {
      await switchChain({ chainId: ARC_TESTNET_CHAIN_ID });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Switch failed: ${msg.slice(0, 100)}`);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
      {/* Network requirement */}
      {!onArcTestnet && isConnected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-200 mb-1">
              Switch to {arcChainName}
            </div>
            <div className="text-xs text-amber-200/80 mb-3">
              Circle Swap is currently only available on Arc Testnet. Mainnet
              support coming soon for all supported chains.
            </div>
            <button
              type="button"
              onClick={handleSwitchToArc}
              className="px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 text-xs font-medium transition-colors"
            >
              Switch network
            </button>
          </div>
        </div>
      )}

      {/* Token In */}
      <div>
        <TokenSelector
          value={tokenIn}
          onChange={(t) => {
            setTokenIn(t);
            if (t === tokenOut) {
              // Auto-flip target so they're never equal
              const fallback = SUPPORTED_TOKENS.find((x) => x !== t);
              if (fallback) setTokenOut(fallback);
            }
          }}
          excluded={tokenOut}
          label="From"
        />
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">balance:</span>
          <TokenBalance token={tokenIn} chainId={ARC_TESTNET_CHAIN_ID} />
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">
          Amount
        </label>
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-lg font-mono text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors pr-20"
            min="0"
            step="any"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500 font-medium pointer-events-none">
            {tokenIn}
          </span>
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleFlip}
          className="w-9 h-9 rounded-full bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700/80 text-zinc-300 transition-all hover:rotate-180 duration-300"
          aria-label="Flip tokens"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
      </div>

      {/* Token Out */}
      <div>
        <TokenSelector
          value={tokenOut}
          onChange={(t) => {
            setTokenOut(t);
            if (t === tokenIn) {
              const fallback = SUPPORTED_TOKENS.find((x) => x !== t);
              if (fallback) setTokenIn(fallback);
            }
          }}
          excluded={tokenIn}
          label="To"
        />
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">est. output:</span>
          <span className="text-zinc-400">
            {quoteLoading
              ? "fetching..."
              : liveQuote?.estimatedOut
                ? `~${liveQuote.estimatedOut} ${tokenOut}`
                : estimatedOut
                  ? `~${estimatedOut} ${tokenOut}`
                  : "enter amount"}
          </span>
        </div>
        {liveQuote?.minOut && (
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-zinc-600">min received:</span>
            <span className="text-zinc-500 font-mono">
              {liveQuote.minOut} {tokenOut}
            </span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={handleSwap}
        disabled={!canSwap}
        className={`w-full h-12 rounded-xl font-semibold transition-all ${
          canSwap
            ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20"
            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
        }`}
      >
        {!isConnected
          ? "Connect wallet to swap"
          : !onArcTestnet
            ? "Switch to Arc Testnet"
            : status === "preparing"
              ? "Preparing..."
              : status === "swapping"
                ? "Swapping..."
                : `Swap ${tokenIn} → ${tokenOut}`}
      </button>

      {/* Steps + result */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            Progress
          </div>
          {steps.map((step: CircleSwapStep, idx: number) => (
            <div
              key={`${step.name}-${idx}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                step.state === "success"
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-200"
                  : step.state === "error"
                    ? "bg-rose-500/5 border-rose-500/20 text-rose-200"
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-300"
              }`}
            >
              <span className="text-base">
                {step.state === "success" ? "✅" : step.state === "error" ? "❌" : "⏳"}
              </span>
              <span className="flex-1 font-medium">{step.name}</span>
              {step.txHash && (
                <a
                  href={step.explorerUrl ?? `#${step.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {shortHash(step.txHash)}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Reset after complete/error */}
      {(status === "complete" || status === "error") && (
        <button
          type="button"
          onClick={() => {
            reset();
            setAmountIn("");
          }}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ↺ Start new swap
        </button>
      )}

      {/* Footer notice */}
      <div className="pt-2 border-t border-zinc-800/50 text-[11px] text-zinc-500 leading-relaxed">
        Powered by{" "}
        <a
          href="https://docs.arc.io/app-kit/swap"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Circle App Kit · Swap Kit
        </a>
        . Same-chain swaps only. Arc Testnet supports USDC ↔ EURC ↔ cirBTC.
      </div>
    </div>
  );
}
