/**
 * Quote aggregator — fetches all providers in parallel
 */

import { Quote, QuoteRequest, QuoteListResult } from "./types";
import { getCctpQuote } from "./cctp";
import { getRelayQuote } from "./relay";
import { getAcrossQuote } from "./across";

const QUOTE_TIMEOUT_MS = 8000;

/**
 * Fetch quotes from all enabled providers in parallel
 * Each quote has a timeout — slow providers don't block fast ones
 */
export async function getAllQuotes(
  request: QuoteRequest,
): Promise<QuoteListResult> {
  // CCTP is sync (deterministic, no API)
  const cctpQuote = getCctpQuote(request);

  // Relay needs API call with timeout
  const relayController = new AbortController();
  const relayTimer = setTimeout(() => relayController.abort(), QUOTE_TIMEOUT_MS);
  const relayPromise = getRelayQuote(request, relayController.signal).finally(() =>
    clearTimeout(relayTimer),
  );

  // Across needs API call with timeout
  const acrossController = new AbortController();
  const acrossTimer = setTimeout(() => acrossController.abort(), QUOTE_TIMEOUT_MS);
  const acrossPromise = getAcrossQuote(request, acrossController.signal).finally(() =>
    clearTimeout(acrossTimer),
  );

  const [relayQuote, acrossQuote] = await Promise.all([relayPromise, acrossPromise]);

  const quotes: Quote[] = [cctpQuote, relayQuote, acrossQuote];

  // Compute "best" quotes
  const available = quotes.filter((q) => q.status === "available");

  let bestByReceive: Quote["provider"] | undefined;
  if (available.length > 0) {
    const best = available.reduce((acc, q) => {
      const accOut = BigInt(acc.amountOut || "0");
      const qOut = BigInt(q.amountOut || "0");
      return qOut > accOut ? q : acc;
    });
    bestByReceive = best.provider;
  }

  let bestBySpeed: Quote["provider"] | undefined;
  if (available.length > 0) {
    const fastest = available.reduce((acc, q) =>
      (q.etaSeconds ?? Infinity) < (acc.etaSeconds ?? Infinity) ? q : acc,
    );
    bestBySpeed = fastest.provider;
  }

  return {
    quotes,
    fetchedAt: Date.now(),
    bestByReceive,
    bestBySpeed,
  };
}

/**
 * Format ETA seconds into human-readable
 */
export function formatEta(seconds?: number): string {
  if (!seconds) return "--";
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${Math.round(seconds / 3600)}h`;
}
