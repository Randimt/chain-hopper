/**
 * Across Protocol API integration
 * Testnet: https://testnet.across.to/api
 *
 * Across uses the SpokePool contract pattern:
 * 1. GET /api/suggested-fees → get quote + spoke pool address
 * 2. User calls depositV3() on origin SpokePool
 * 3. Relayer fills on destination chain (~10s)
 * 4. Poll /api/deposit/status?... for completion
 */

import {
  Quote,
  QuoteRequest,
  failedQuote,
  formatUSDC,
  noRouteQuote,
} from "./types";
import { USDC_ADDRESSES } from "../wagmi";
import { sepolia, baseSepolia, arbitrumSepolia } from "wagmi/chains";

const ACROSS_API_BASE = "https://testnet.across.to/api";

// Across testnet supports these chains
const ACROSS_SUPPORTED_CHAINS = new Set<number>([
  sepolia.id,
  baseSepolia.id,
  arbitrumSepolia.id,
]);

interface AcrossSuggestedFeesResponse {
  estimatedFillTimeSec: number;
  outputAmount: string;
  totalRelayFee: { pct: string; total: string };
  relayerCapitalFee: { pct: string; total: string };
  relayerGasFee: { pct: string; total: string };
  lpFee: { pct: string; total: string };
  spokePoolAddress: string;
  destinationSpokePoolAddress: string;
  exclusiveRelayer: string;
  exclusivityDeadline: number;
  quoteBlock: string;
  timestamp: string;
  fillDeadline: string;
  isAmountTooLow: boolean;
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
  };
  inputToken: { address: string; symbol: string; decimals: number; chainId: number };
  outputToken: { address: string; symbol: string; decimals: number; chainId: number };
  id: string;
}

/**
 * Check if Across supports a given source/dest chain pair
 */
export function acrossSupports(sourceChain: number, destChain: number): boolean {
  return (
    ACROSS_SUPPORTED_CHAINS.has(sourceChain) &&
    ACROSS_SUPPORTED_CHAINS.has(destChain) &&
    sourceChain !== destChain
  );
}

/**
 * Fetch a quote from Across Protocol
 */
export async function getAcrossQuote(
  request: QuoteRequest,
  signal?: AbortSignal,
): Promise<Quote> {
  const { sourceChain, destChain, amountIn } = request;

  // Pre-check support
  if (!acrossSupports(sourceChain, destChain)) {
    return noRouteQuote(
      "across",
      request,
      "Across testnet supports Sepolia / Base Sepolia / Arbitrum Sepolia",
    );
  }

  const sourceUsdc = USDC_ADDRESSES[sourceChain];
  const destUsdc = USDC_ADDRESSES[destChain];

  if (!sourceUsdc || !destUsdc) {
    return noRouteQuote("across", request, "USDC contract not configured for this chain");
  }

  try {
    const params = new URLSearchParams({
      inputToken: sourceUsdc,
      outputToken: destUsdc,
      originChainId: sourceChain.toString(),
      destinationChainId: destChain.toString(),
      amount: amountIn,
    });

    const res = await fetch(`${ACROSS_API_BASE}/suggested-fees?${params}`, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let friendlyMsg = `HTTP ${res.status}`;
      try {
        const errData = JSON.parse(text) as { message?: string; type?: string };
        if (errData.message) {
          friendlyMsg = errData.message;
        } else if (errData.type) {
          friendlyMsg = errData.type;
        }
      } catch {
        if (text) friendlyMsg = `${friendlyMsg}: ${text.slice(0, 100)}`;
      }
      return failedQuote("across", request, friendlyMsg);
    }

    const data = (await res.json()) as AcrossSuggestedFeesResponse;

    // Check if amount too low
    if (data.isAmountTooLow) {
      return failedQuote(
        "across",
        request,
        `Amount too low. Minimum: ${formatUSDC(data.limits.minDeposit)} USDC`,
      );
    }

    // Check max deposit
    const amountInBig = BigInt(amountIn);
    const maxDepositBig = BigInt(data.limits.maxDeposit);
    if (amountInBig > maxDepositBig) {
      return failedQuote(
        "across",
        request,
        `Amount exceeds liquidity. Max: ${formatUSDC(data.limits.maxDeposit)} USDC`,
      );
    }

    // Calculate slippage from inputAmount vs outputAmount
    const outputAmountBig = BigInt(data.outputAmount);
    const slippageBps = Number(((amountInBig - outputAmountBig) * BigInt(10000)) / amountInBig);
    const slippagePercent = slippageBps / 100;

    // Total fee in USDC = inputAmount - outputAmount
    const feeUsdcBig = amountInBig - outputAmountBig;
    const feeUsdc = formatUSDC(feeUsdcBig.toString());

    return {
      provider: "across",
      status: "available",
      sourceChain,
      destChain,
      amountIn,
      amountInFormatted: formatUSDC(amountIn),
      amountOut: data.outputAmount,
      amountOutFormatted: formatUSDC(data.outputAmount),
      amountOutMin: data.outputAmount, // Across guarantees outputAmount (no slippage on fill)
      amountOutMinFormatted: formatUSDC(data.outputAmount),
      feeUsdc,
      gasFeeUsd: undefined,
      totalFeeUsd: undefined,
      etaSeconds: data.estimatedFillTimeSec || 10,
      slippagePercent,
      exchangeRate: Number(outputAmountBig) / Number(amountInBig),
      raw: data,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return failedQuote("across", request, "Quote request timed out");
    }
    return failedQuote("across", request, (err as Error).message || "Network error");
  }
}

/**
 * Extract executable deposit data from Across quote
 * Returns spoke pool address + depositV3 args for contract call
 */
export interface AcrossDepositData {
  spokePoolAddress: `0x${string}`;
  depositor: `0x${string}`;
  recipient: `0x${string}`;
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  destinationChainId: bigint;
  exclusiveRelayer: `0x${string}`;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusivityDeadline: number;
  message: `0x${string}`;
}

export function extractAcrossDeposit(
  quote: Quote,
  depositor: `0x${string}`,
  recipient?: `0x${string}`,
): AcrossDepositData | null {
  if (quote.provider !== "across" || quote.status !== "available" || !quote.raw) {
    return null;
  }

  const data = quote.raw as AcrossSuggestedFeesResponse;

  return {
    spokePoolAddress: data.spokePoolAddress as `0x${string}`,
    depositor,
    recipient: (recipient || depositor) as `0x${string}`,
    inputToken: data.inputToken.address as `0x${string}`,
    outputToken: data.outputToken.address as `0x${string}`,
    inputAmount: BigInt(quote.amountIn),
    outputAmount: BigInt(data.outputAmount),
    destinationChainId: BigInt(quote.destChain),
    exclusiveRelayer: data.exclusiveRelayer as `0x${string}`,
    quoteTimestamp: parseInt(data.timestamp),
    fillDeadline: parseInt(data.fillDeadline),
    exclusivityDeadline: data.exclusivityDeadline,
    message: "0x" as `0x${string}`,
  };
}

/**
 * Poll Across deposit status
 * Uses the deposit ID from the deposit tx
 */
export async function pollAcrossStatus(
  originChainId: number,
  depositId: string,
  signal?: AbortSignal,
): Promise<{
  status: "filled" | "pending" | "expired";
  fillTxHash?: string;
}> {
  try {
    const params = new URLSearchParams({
      originChainId: originChainId.toString(),
      depositId,
    });

    const res = await fetch(`${ACROSS_API_BASE}/deposit/status?${params}`, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return { status: "pending" };
    }

    const data = await res.json();

    if (data.status === "filled" && data.fillTx) {
      return { status: "filled", fillTxHash: data.fillTx };
    } else if (data.status === "expired") {
      return { status: "expired" };
    } else {
      return { status: "pending" };
    }
  } catch {
    return { status: "pending" };
  }
}

/**
 * Across SpokePool depositV3 ABI (subset)
 */
export const SPOKE_POOL_ABI = [
  {
    type: "function",
    name: "depositV3",
    stateMutability: "payable",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "recipient", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "exclusiveRelayer", type: "address" },
      { name: "quoteTimestamp", type: "uint32" },
      { name: "fillDeadline", type: "uint32" },
      { name: "exclusivityDeadline", type: "uint32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "V3FundsDeposited",
    inputs: [
      { name: "inputToken", type: "address", indexed: false },
      { name: "outputToken", type: "address", indexed: false },
      { name: "inputAmount", type: "uint256", indexed: false },
      { name: "outputAmount", type: "uint256", indexed: false },
      { name: "destinationChainId", type: "uint256", indexed: true },
      { name: "depositId", type: "uint32", indexed: true },
      { name: "quoteTimestamp", type: "uint32", indexed: false },
      { name: "fillDeadline", type: "uint32", indexed: false },
      { name: "exclusivityDeadline", type: "uint32", indexed: false },
      { name: "depositor", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: false },
      { name: "exclusiveRelayer", type: "address", indexed: false },
      { name: "message", type: "bytes", indexed: false },
    ],
  },
] as const;
