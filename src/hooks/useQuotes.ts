/**
 * useQuotes — hook to fetch & poll quotes from all aggregators
 */

import { useEffect, useRef, useState } from "react";
import { Quote, QuoteRequest, QuoteListResult } from "@/lib/quotes/types";
import { getAllQuotes } from "@/lib/quotes/aggregator";
import { loadSettings } from "@/lib/bridge-settings";

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
 * Re-fetches on input change + every N seconds (configurable in settings)
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
  const [settingsVersion, setSettingsVersion] = useState(0);
  const requestRef = useRef<string>("");

  const requestKey = request
    ? `${request.sourceChain}-${request.destChain}-${request.amountIn}-${request.sender || ""}`
    : "";

  // Listen for settings changes — refetch when toggles change
  useEffect(() => {
    const handler = () => setSettingsVersion((v) => v + 1);
    window.addEventListener("plix-settings-updated", handler);
    return () => window.removeEventListener("plix-settings-updated", handler);
  }, []);

  const fetchQuotes = async (req: QuoteRequest) => {
    setIsLoading(true);
    setError(undefined);
    try {
      const settings = loadSettings();
      // Validated recipient — only pass if valid 0x... format
      const validRecipient =
        settings.customRecipient && /^0x[a-fA-F0-9]{40}$/.test(settings.customRecipient)
          ? (settings.customRecipient as `0x${string}`)
          : undefined;
      // Inject slippage + recipient into request
      const reqWithSlippage: QuoteRequest = {
        ...req,
        slippageBps: settings.slippageBps,
        recipient: validRecipient ?? req.recipient,
      };
      const res = await getAllQuotes(reqWithSlippage, {
        enabledProviders: settings.enabledProviders,
        experimentalRoutes: settings.experimentalRoutes,
      });
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

    // Auto-refresh per user-configured interval (0 = disabled)
    const settings = loadSettings();
    if (settings.autoRefreshSec <= 0) return;

    const interval = setInterval(() => {
      if (requestRef.current === requestKey) {
        fetchQuotes(request);
      }
    }, settings.autoRefreshSec * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, settingsVersion]);

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
