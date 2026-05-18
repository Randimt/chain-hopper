/**
 * Relay.link API integration
 * Testnet: https://api.testnets.relay.link
 * 
 * Relay uses a single-step UX:
 * 1. POST /quote → get approve + deposit tx data
 * 2. User signs both txs → relay solver fills on dest chain
 * 3. Poll /intents/status?requestId=... for completion
 */

import {
  Quote,
  QuoteRequest,
  failedQuote,
  formatUSDC,
  noRouteQuote,
} from "./types";
import { CHAIN_INFO, USDC_ADDRESSES } from "../wagmi";
import { sepolia, baseSepolia } from "wagmi/chains";

const RELAY_API_BASE = "https://api.testnets.relay.link";

// Relay only supports these chains on testnet
const RELAY_SUPPORTED_CHAINS = new Set<number>([
  sepolia.id,
  baseSepolia.id,
]);

interface RelayQuoteResponse {
  steps: Array<{
    id: string;
    action: string;
    description: string;
    kind: string;
    items: Array<{
      status: string;
      data: {
        from: string;
        to: string;
        data: string;
        value: string;
        chainId: number;
        gas: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
      };
      check?: {
        endpoint: string;
        method: string;
      };
    }>;
    requestId?: string;
  }>;
  fees: {
    gas: { amount: string; amountFormatted: string; amountUsd: string };
    relayer: { amount: string; amountFormatted: string; amountUsd: string };
    relayerService: { amount: string; amountFormatted: string; amountUsd: string };
    app: { amount: string; amountFormatted: string; amountUsd: string };
  };
  details: {
    operation: string;
    sender: string;
    recipient: string;
    currencyIn: { amount: string; amountFormatted: string; amountUsd: string };
    currencyOut: {
      amount: string;
      amountFormatted: string;
      amountUsd: string;
      minimumAmount: string;
    };
    timeEstimate: number;
    rate: string;
    slippageTolerance: {
      destination: { percent: string; value: string };
    };
    totalImpact: { usd: string; percent: string };
  };
}

/**
 * Check if Relay supports a given source/dest chain pair
 */
export function relaySupports(sourceChain: number, destChain: number): boolean {
  return (
    RELAY_SUPPORTED_CHAINS.has(sourceChain) &&
    RELAY_SUPPORTED_CHAINS.has(destChain) &&
    sourceChain !== destChain
  );
}

/**
 * Fetch a quote from Relay.link
 * Returns Quote with status "available" / "no_route" / "failed"
 */
export async function getRelayQuote(
  request: QuoteRequest,
  signal?: AbortSignal,
): Promise<Quote> {
  const { sourceChain, destChain, amountIn, sender, recipient, slippageBps } = request;

  // Pre-check support
  if (!relaySupports(sourceChain, destChain)) {
    return noRouteQuote("relay", request, "Relay testnet only supports Sepolia ↔ Base Sepolia");
  }

  const sourceUsdc = USDC_ADDRESSES[sourceChain];
  const destUsdc = USDC_ADDRESSES[destChain];

  if (!sourceUsdc || !destUsdc) {
    return noRouteQuote("relay", request, "USDC contract not configured for this chain");
  }

  // Need a sender address — use a placeholder if not provided (just for quote)
  const user = sender || "0x0000000000000000000000000000000000000001";

  try {
    const body = {
      user,
      recipient: recipient || user,
      originChainId: sourceChain,
      destinationChainId: destChain,
      originCurrency: sourceUsdc,
      destinationCurrency: destUsdc,
      amount: amountIn,
      tradeType: "EXACT_INPUT",
      // Relay default slippage is 4%, override if provided
      ...(slippageBps && { slippageTolerance: (slippageBps / 100).toString() }),
    };

    const res = await fetch(`${RELAY_API_BASE}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return failedQuote("relay", request, `HTTP ${res.status}: ${text.slice(0, 100)}`);
    }

    const data = (await res.json()) as RelayQuoteResponse;

    if (!data.details?.currencyOut) {
      return failedQuote("relay", request, "Invalid quote response from Relay");
    }

    const out = data.details.currencyOut;
    const slippagePct = parseFloat(data.details.slippageTolerance?.destination?.percent || "0");

    // Total fee = relayer + relayer service + relayer gas (in USDC)
    const totalFeeUsd =
      parseFloat(data.fees.relayer.amountUsd || "0") +
      parseFloat(data.fees.relayerService?.amountUsd || "0");

    return {
      provider: "relay",
      status: "available",
      sourceChain,
      destChain,
      amountIn,
      amountInFormatted: formatUSDC(amountIn),
      amountOut: out.amount,
      amountOutFormatted: out.amountFormatted,
      amountOutMin: out.minimumAmount,
      amountOutMinFormatted: formatUSDC(out.minimumAmount),
      feeUsdc: data.fees.relayer.amountFormatted,
      gasFeeUsd: data.fees.gas.amountUsd,
      totalFeeUsd: totalFeeUsd.toFixed(4),
      etaSeconds: data.details.timeEstimate || 10,
      slippagePercent: slippagePct,
      exchangeRate: parseFloat(data.details.rate || "0"),
      raw: data,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return failedQuote("relay", request, "Quote request timed out");
    }
    return failedQuote("relay", request, (err as Error).message || "Network error");
  }
}

/**
 * Poll Relay status for a given requestId
 * Returns "success" | "pending" | "failed"
 */
export async function pollRelayStatus(
  requestId: string,
  signal?: AbortSignal,
): Promise<{
  status: "success" | "pending" | "failed";
  txHashes?: { origin?: string; destination?: string };
  error?: string;
}> {
  try {
    const res = await fetch(
      `${RELAY_API_BASE}/intents/status?requestId=${encodeURIComponent(requestId)}`,
      { signal, headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      return { status: "pending" };
    }

    const data = await res.json();
    const status = data.status;

    if (status === "success") {
      return {
        status: "success",
        txHashes: {
          origin: data.inTxHashes?.[0],
          destination: data.txHashes?.[0],
        },
      };
    } else if (status === "failure" || status === "refund") {
      return { status: "failed", error: data.details || "Bridge failed" };
    } else {
      return { status: "pending" };
    }
  } catch (err) {
    return { status: "pending" };
  }
}

/**
 * Extract executable tx data from a Relay quote
 * Returns approve tx + deposit tx with requestId
 */
export interface RelayExecuteData {
  approveTx?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    chainId: number;
  };
  depositTx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    chainId: number;
  };
  requestId: string;
}

export function extractRelayTxs(quote: Quote): RelayExecuteData | null {
  if (quote.provider !== "relay" || quote.status !== "available" || !quote.raw) {
    return null;
  }

  const data = quote.raw as RelayQuoteResponse;
  const approveStep = data.steps.find((s) => s.id === "approve");
  const depositStep = data.steps.find((s) => s.id === "deposit");

  if (!depositStep || !depositStep.items[0]) return null;

  const depositItem = depositStep.items[0];
  const requestId = depositStep.requestId || "";

  const result: RelayExecuteData = {
    depositTx: {
      to: depositItem.data.to as `0x${string}`,
      data: depositItem.data.data as `0x${string}`,
      value: BigInt(depositItem.data.value || "0"),
      chainId: depositItem.data.chainId,
    },
    requestId,
  };

  if (approveStep && approveStep.items[0]) {
    const approveItem = approveStep.items[0];
    result.approveTx = {
      to: approveItem.data.to as `0x${string}`,
      data: approveItem.data.data as `0x${string}`,
      value: BigInt(approveItem.data.value || "0"),
      chainId: approveItem.data.chainId,
    };
  }

  return result;
}
