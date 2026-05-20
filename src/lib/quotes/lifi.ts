/**
 * LiFi placeholder integration
 *
 * LiFi supports 4 testnet chains in their registry (Base Sepolia, OP Sepolia,
 * Arbitrum Sepolia, Arc Testnet) but routing engine returns NO_QUOTE for all
 * pairs because solver liquidity is mainnet-only.
 *
 * Rather than expose constant "failed" cards, we surface this transparently:
 * - Always return "no_route" status with a clear "mainnet only" message
 * - Quote card stays disabled but visible (educational + recruiter-friendly)
 * - When the app eventually moves to mainnet, swap this stub for the real
 *   @lifi/sdk integration without touching the aggregator interface.
 */

import { Quote, QuoteRequest, formatUSDC, noRouteQuote } from "./types";

/**
 * Fetch a quote from LiFi
 * Currently always returns "no_route" — testnet liquidity is mainnet-only
 */
export async function getLifiQuote(
  request: QuoteRequest,
  _signal?: AbortSignal,
): Promise<Quote> {
  // No real API call — testnet returns NO_QUOTE for every pair anyway.
  // Surface a clear, honest message instead of pretending to query.
  return {
    ...noRouteQuote(
      "lifi",
      request,
      "LiFi liquidity is mainnet-only. Activates when Lyxsa migrates to mainnet.",
    ),
    // Keep a hint of what would be available so users see expected fee/ETA
    amountInFormatted: formatUSDC(request.amountIn),
    etaSeconds: 30,
  };
}
