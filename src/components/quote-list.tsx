"use client";

import { Quote, PROVIDER_INFO, QuoteProvider } from "@/lib/quotes/types";
import { formatEta } from "@/lib/quotes/aggregator";

interface QuoteCardProps {
  quote: Quote;
  isSelected: boolean;
  isBestReceive: boolean;
  isBestSpeed: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

function QuoteCard({
  quote,
  isSelected,
  isBestReceive,
  isBestSpeed,
  onSelect,
  disabled,
}: QuoteCardProps) {
  const info = PROVIDER_INFO[quote.provider];
  const isAvailable = quote.status === "available";
  const isClickable = isAvailable && !disabled;

  const borderClass = isSelected
    ? "border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/40"
    : isAvailable
      ? "border-zinc-700 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/60"
      : "border-zinc-800 bg-zinc-950/40 opacity-60";

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={onSelect}
      className={`w-full p-4 border rounded-xl text-left transition-all ${borderClass} ${
        isClickable ? "cursor-pointer" : "cursor-not-allowed"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono uppercase px-2 py-0.5 rounded border ${info.badgeColor}`}
          >
            {info.shortName}
          </span>
          {isBestReceive && isAvailable && (
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Best Receive
            </span>
          )}
          {isBestSpeed && !isBestReceive && isAvailable && (
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Fastest
            </span>
          )}
        </div>
        {isSelected && (
          <span className="text-cyan-400 text-xs font-medium flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Selected
          </span>
        )}
      </div>

      {/* Provider name */}
      <div className="text-sm font-semibold text-zinc-100 mb-1">{info.name}</div>
      <div className="text-xs text-zinc-500 mb-3">{info.description}</div>

      {/* Status / Quote details */}
      {quote.status === "available" && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">You receive</span>
            <span className="text-zinc-100 font-medium">
              {Number(quote.amountOutFormatted).toFixed(4)} USDC
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Fee</span>
            <span className="text-zinc-300">
              {quote.feeUsdc ? `${Number(quote.feeUsdc).toFixed(4)} USDC` : "--"}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">ETA</span>
            <span className="text-zinc-300">{formatEta(quote.etaSeconds)}</span>
          </div>
          {quote.slippagePercent && quote.slippagePercent > 0 ? (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Slippage</span>
              <span className="text-zinc-300">
                {quote.slippagePercent.toFixed(2)}%
              </span>
            </div>
          ) : null}
        </div>
      )}

      {quote.status === "no_route" && (
        <div className="text-xs text-zinc-500 italic">
          {quote.errorMessage || "No route available for this pair"}
        </div>
      )}

      {quote.status === "failed" && (
        <div className="text-xs text-red-400/80">
          {quote.errorMessage || "Quote failed"}
        </div>
      )}

      {quote.status === "loading" && (
        <div className="text-xs text-zinc-500 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-cyan-400 animate-spin"></span>
          Fetching quote...
        </div>
      )}
    </button>
  );
}

export interface QuoteListProps {
  quotes: Quote[];
  bestByReceive?: QuoteProvider;
  bestBySpeed?: QuoteProvider;
  selectedProvider: QuoteProvider | null;
  onSelectProvider: (provider: QuoteProvider) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function QuoteList({
  quotes,
  bestByReceive,
  bestBySpeed,
  selectedProvider,
  onSelectProvider,
  isLoading,
  disabled,
}: QuoteListProps) {
  if (quotes.length === 0 && !isLoading) {
    return null;
  }

  // Single-quote layout (CCTP-only mode) — clean inline summary, no card grid
  if (quotes.length === 1) {
    const quote = quotes[0];
    const info = PROVIDER_INFO[quote.provider];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
            Bridge Quote
          </div>
          {isLoading && (
            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-zinc-700 border-t-cyan-400 animate-spin"></span>
              Updating
            </div>
          )}
        </div>
        <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-900/40 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs font-mono uppercase px-2 py-0.5 rounded border ${info.badgeColor}`}
            >
              {info.shortName}
            </span>
            <span className="text-sm text-zinc-200">{info.name}</span>
          </div>
          {quote.status === "available" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">You receive</span>
                <span className="text-zinc-100 font-medium">
                  {Number(quote.amountOutFormatted).toFixed(4)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Fee</span>
                <span className="text-zinc-300">
                  {quote.feeUsdc
                    ? `${Number(quote.feeUsdc).toFixed(4)} USDC`
                    : "--"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">ETA</span>
                <span className="text-zinc-300">
                  {formatEta(quote.etaSeconds)}
                </span>
              </div>
            </div>
          )}
          {quote.status === "no_route" && (
            <div className="text-sm text-zinc-500 italic">
              {quote.errorMessage || "No route available for this pair"}
            </div>
          )}
          {quote.status === "failed" && (
            <div className="text-sm text-red-400/80">
              {quote.errorMessage || "Quote failed"}
            </div>
          )}
          {quote.status === "loading" && (
            <div className="text-sm text-zinc-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-cyan-400 animate-spin"></span>
              Fetching quote...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Multi-quote layout (experimental mode) — 3-up grid for comparison
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Bridge Routes
        </div>
        {isLoading && (
          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-zinc-700 border-t-cyan-400 animate-spin"></span>
            Updating
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {quotes.map((quote) => (
          <QuoteCard
            key={quote.provider}
            quote={quote}
            isSelected={selectedProvider === quote.provider}
            isBestReceive={bestByReceive === quote.provider}
            isBestSpeed={bestBySpeed === quote.provider}
            onSelect={() => onSelectProvider(quote.provider)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
