/**
 * CCTP wrapper as a Quote provider
 * Wraps existing CCTP V2 logic in the universal Quote interface
 */

import { Quote, QuoteRequest, formatUSDC, noRouteQuote } from "./types";
import { CCTP_DOMAINS } from "../cctp";

/**
 * Check if CCTP supports a given source/dest chain pair
 */
export function cctpSupports(sourceChain: number, destChain: number): boolean {
  return (
    CCTP_DOMAINS[sourceChain] !== undefined &&
    CCTP_DOMAINS[destChain] !== undefined &&
    sourceChain !== destChain
  );
}

/**
 * "Quote" CCTP — there's no API call, the rate is deterministic:
 *   - Fast Transfer: 0.1% fee (1 USDC = 0.999 USDC out)
 *   - Standard: similar rate, longer ETA for Arc routes
 */
export function getCctpQuote(request: QuoteRequest): Quote {
  const { sourceChain, destChain, amountIn } = request;

  if (!cctpSupports(sourceChain, destChain)) {
    return noRouteQuote("cctp", request, "CCTP V2 not supported for this chain pair");
  }

  // CCTP fee: ~0.1% (1000 wei per million for fast transfer in our config)
  // From production: maxFee=1000 (=0.001 USDC per million)
  const amountInBig = BigInt(amountIn);
  const fee = amountInBig / BigInt(1000); // 0.1%
  const amountOut = amountInBig - fee;

  // Arc Testnet (id 5042002) is Standard transfer only — slower
  const ARC_TESTNET_ID = 5042002;
  const isArcRoute = sourceChain === ARC_TESTNET_ID || destChain === ARC_TESTNET_ID;
  const etaSeconds = isArcRoute ? 13 * 60 : 30; // 13min vs 30s

  return {
    provider: "cctp",
    status: "available",
    sourceChain,
    destChain,
    amountIn,
    amountInFormatted: formatUSDC(amountIn),
    amountOut: amountOut.toString(),
    amountOutFormatted: formatUSDC(amountOut),
    amountOutMin: amountOut.toString(), // CCTP no slippage
    amountOutMinFormatted: formatUSDC(amountOut),
    feeUsdc: formatUSDC(fee),
    gasFeeUsd: "0.01", // rough estimate, actual depends on chain gas
    totalFeeUsd: formatUSDC(fee), // mostly fee in USDC since gas is small
    etaSeconds,
    slippagePercent: 0,
    exchangeRate: 0.999,
    fetchedAt: Date.now(),
  };
}
