/**
 * useQuotes — hook to fetch & poll quotes from all aggregators
 */

import { useEffect, useRef, useState } from "react";
import { Quote, QuoteRequest, QuoteListResult } from "@/lib/quotes/types";
import { getAllQuotes } from "@/lib/quotes/aggregator";

export interface UseQuotesResult {
  quotes: Quote[];
  bestByReceive?: Quote["provider"];
  bestBySpeed?: Quote["provider"];
  isLoading: boolean;
  fetchedAt: number;
  error?: string;
  refresh: () => void;
}

/**
 * Returns live quotes for given source/dest/amount
 * Re-fetches on input change + every 30s for staleness
 *
 * Pass `null` request to disable fetching
 */
export function useQuotes(request: QuoteRequest | null): UseQuotesResult {
  const [result, setResult] = useState<QuoteListResult>({
    quotes: [],
    fetchedAt: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const requestRef = useRef<string>("");

  const requestKey = request
    ? `${request.sourceChain}-${request.destChain}-${request.amountIn}-${request.sender || ""}`
    : "";

  const fetchQuotes = async (req: QuoteRequest) => {
    setIsLoading(true);
    setError(undefined);
    try {
      const res = await getAllQuotes(req);
      // Only update if request hasn't changed since fetch started
      const currentKey = `${req.sourceChain}-${req.destChain}-${req.amountIn}-${req.sender || ""}`;
      if (requestRef.current === currentKey) {
        setResult(res);
      }
    } catch (err) {
      setError((err as Error).message || "Failed to fetch quotes");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!request || !request.amountIn || request.amountIn === "0") {
      setResult({ quotes: [], fetchedAt: 0 });
      return;
    }

    requestRef.current = requestKey;
    fetchQuotes(request);

    // Auto-refresh every 30s
    const interval = setInterval(() => {
      if (requestRef.current === requestKey) {
        fetchQuotes(request);
      }
    }, 30_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const refresh = () => {
    if (request && request.amountIn && request.amountIn !== "0") {
      fetchQuotes(request);
    }
  };

  return {
    quotes: result.quotes,
    bestByReceive: result.bestByReceive,
    bestBySpeed: result.bestBySpeed,
    isLoading,
    fetchedAt: result.fetchedAt,
    error,
    refresh,
  };
}
