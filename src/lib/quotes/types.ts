/**
 * Universal Quote interface for cross-aggregator comparison
 * Each provider (CCTP, Relay, Across) implements this shape
 */

export type QuoteProvider = "cctp" | "relay" | "across" | "lifi";

export type QuoteStatus =
  | "available" // Route works, ready to execute
  | "loading" // Fetching quote
  | "no_route" // Provider doesn't support this pair
  | "failed" // API error / timeout
  | "amount_too_low" // Below minimum
  | "amount_too_high"; // Above maximum

export interface Quote {
  provider: QuoteProvider;
  status: QuoteStatus;

  // Input
  sourceChain: number;
  destChain: number;
  amountIn: string; // wei (USDC has 6 decimals)
  amountInFormatted: string; // human-readable e.g. "10"

  // Output
  amountOut?: string; // wei
  amountOutFormatted?: string; // e.g. "9.997"
  amountOutMin?: string; // accounting for slippage
  amountOutMinFormatted?: string;

  // Fee breakdown
  feeUsdc?: string; // fee in USDC (formatted, e.g. "0.023")
  gasFeeUsd?: string; // estimated gas cost in USD
  totalFeeUsd?: string; // total all-in cost

  // Timing
  etaSeconds?: number; // estimated bridge time

  // Route metadata
  slippagePercent?: number; // slippage tolerance applied
  exchangeRate?: number; // amountOut / amountIn

  // Provider-specific extras (opaque)
  raw?: unknown;

  // Error info
  errorMessage?: string;

  // Timestamp for freshness
  fetchedAt: number;
}

export interface QuoteRequest {
  sourceChain: number;
  destChain: number;
  amountIn: string; // wei
  recipient?: `0x${string}`; // defaults to sender
  sender?: `0x${string}`;
  slippageBps?: number; // basis points (50 = 0.5%)
}

export interface QuoteListResult {
  quotes: Quote[];
  fetchedAt: number;
  bestByReceive?: QuoteProvider;
  bestBySpeed?: QuoteProvider;
}

/**
 * Helper to create a standard "no route" quote stub
 */
export function noRouteQuote(
  provider: QuoteProvider,
  request: QuoteRequest,
  reason?: string,
): Quote {
  return {
    provider,
    status: "no_route",
    sourceChain: request.sourceChain,
    destChain: request.destChain,
    amountIn: request.amountIn,
    amountInFormatted: formatUSDC(request.amountIn),
    errorMessage: reason,
    fetchedAt: Date.now(),
  };
}

export function failedQuote(
  provider: QuoteProvider,
  request: QuoteRequest,
  error: string,
): Quote {
  return {
    provider,
    status: "failed",
    sourceChain: request.sourceChain,
    destChain: request.destChain,
    amountIn: request.amountIn,
    amountInFormatted: formatUSDC(request.amountIn),
    errorMessage: error,
    fetchedAt: Date.now(),
  };
}

export function loadingQuote(
  provider: QuoteProvider,
  request: QuoteRequest,
): Quote {
  return {
    provider,
    status: "loading",
    sourceChain: request.sourceChain,
    destChain: request.destChain,
    amountIn: request.amountIn,
    amountInFormatted: formatUSDC(request.amountIn),
    fetchedAt: Date.now(),
  };
}

/**
 * Convert wei (6 decimals) to human-readable USDC string
 */
export function formatUSDC(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const million = BigInt(1_000_000);
  const whole = value / million;
  const fraction = value % million;
  if (fraction === BigInt(0)) return whole.toString();
  const fractionStr = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}

/**
 * Parse human USDC string to wei (6 decimals)
 */
export function parseUSDC(amount: string): string {
  if (!amount || amount === "0" || amount === ".") return "0";
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(6, "0").slice(0, 6);
  return (BigInt(whole || "0") * BigInt(1_000_000) + BigInt(paddedFraction || "0")).toString();
}

/**
 * Provider display metadata
 */
export const PROVIDER_INFO: Record<QuoteProvider, {
  name: string;
  shortName: string;
  description: string;
  logoUrl?: string;
  color: string;
  badgeColor: string;
}> = {
  cctp: {
    name: "Circle CCTP V2",
    shortName: "CCTP",
    description: "Native USDC by Circle",
    color: "#22c55e", // green
    badgeColor: "bg-green-500/15 text-green-400 border-green-500/30",
  },
  relay: {
    name: "Relay.link",
    shortName: "Relay",
    description: "Fast intent-based bridging",
    color: "#a855f7", // purple
    badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  across: {
    name: "Across Protocol",
    shortName: "Across",
    description: "Optimistic bridging",
    color: "#06b6d4", // cyan
    badgeColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  },
  lifi: {
    name: "LiFi",
    shortName: "LiFi",
    description: "Meta-aggregator",
    color: "#f59e0b", // amber
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};
