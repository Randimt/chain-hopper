/**
 * Quote aggregator — fetches all enabled providers in parallel
 */

import { Quote, QuoteProvider, QuoteRequest, QuoteListResult } from "./types";
import { getCctpQuote } from "./cctp";
import { getRelayQuote } from "./relay";
import { getAcrossQuote } from "./across";
import { getLifiQuote } from "./lifi";

const QUOTE_TIMEOUT_MS = 8000;

export interface AggregatorOptions {
  enabledProviders?: Record<QuoteProvider, boolean>;
  /** Show alternative routes (Relay, Across, LiFi). When false, only CCTP is fetched. */
  experimentalRoutes?: boolean;
}

/**
 * Fetch quotes from all enabled providers in parallel
 * Each quote has a timeout — slow providers don't block fast ones
 */
export async function getAllQuotes(
  request: QuoteRequest,
  options: AggregatorOptions = {},
): Promise<QuoteListResult> {
  const enabled = options.enabledProviders ?? {
    cctp: true,
    relay: true,
    across: true,
    lifi: false,
  };
  const experimental = options.experimentalRoutes ?? false;

  const quotePromises: Promise<Quote>[] = [];

  // CCTP is sync (deterministic, no API) — always fetched
  if (enabled.cctp) {
    quotePromises.push(Promise.resolve(getCctpQuote(request)));
  }

  // Alternative routes: only fetched if experimental mode is enabled.
  // Testnet liquidity for Relay/Across/LiFi is unreliable, so default UX is CCTP-only.
  if (experimental) {
    if (enabled.relay) {
      const relayController = new AbortController();
      const relayTimer = setTimeout(() => relayController.abort(), QUOTE_TIMEOUT_MS);
      quotePromises.push(
        getRelayQuote(request, relayController.signal).finally(() =>
          clearTimeout(relayTimer),
        ),
      );
    }

    if (enabled.across) {
      const acrossController = new AbortController();
      const acrossTimer = setTimeout(() => acrossController.abort(), QUOTE_TIMEOUT_MS);
      quotePromises.push(
        getAcrossQuote(request, acrossController.signal).finally(() =>
          clearTimeout(acrossTimer),
        ),
      );
    }

    if (enabled.lifi) {
      quotePromises.push(getLifiQuote(request));
    }
  }

  const quotes = await Promise.all(quotePromises);

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
