"use client";

/**
 * Bridge settings — slippage, recipient, provider preferences
 * Persisted to localStorage per wallet address
 */

import { QuoteProvider } from "./quotes/types";

export interface BridgeSettings {
  /** Slippage tolerance in basis points (100 = 1%) */
  slippageBps: number;
  /** Custom recipient address (empty = use connected wallet) */
  customRecipient: string;
  /** Per-provider enable/disable map */
  enabledProviders: Record<QuoteProvider, boolean>;
  /** Quote auto-refresh interval in seconds (0 = manual only) */
  autoRefreshSec: number;
  /** Show alternative routes (Relay, Across, LiFi). Default OFF — testnet liquidity unreliable */
  experimentalRoutes: boolean;
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  slippageBps: 50, // 0.5%
  customRecipient: "",
  enabledProviders: {
    cctp: true,
    relay: true,
    across: true,
    lifi: false, // off by default — mainnet only on testnet
  },
  autoRefreshSec: 30,
  experimentalRoutes: false, // default: clean CCTP-only UX
};

const STORAGE_KEY = "plix:settings";

export function loadSettings(): BridgeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BridgeSettings>;
    // Merge with defaults to handle new fields gracefully
    return {
      slippageBps: parsed.slippageBps ?? DEFAULT_SETTINGS.slippageBps,
      customRecipient: parsed.customRecipient ?? "",
      enabledProviders: {
        ...DEFAULT_SETTINGS.enabledProviders,
        ...(parsed.enabledProviders ?? {}),
      },
      autoRefreshSec: parsed.autoRefreshSec ?? DEFAULT_SETTINGS.autoRefreshSec,
      experimentalRoutes: false, // FORCED OFF: testnet liquidity unreliable, defer to mainnet
      // experimentalRoutes:
      //   parsed.experimentalRoutes ?? DEFAULT_SETTINGS.experimentalRoutes,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: BridgeSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("plix-settings-updated"));
  } catch {
    // localStorage might be full or disabled — silently no-op
  }
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * Slippage presets in basis points
 */
export const SLIPPAGE_PRESETS = [
  { label: "0.1%", bps: 10 },
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "3%", bps: 300 },
] as const;

/**
 * Auto-refresh interval presets
 */
export const REFRESH_PRESETS = [
  { label: "Off", seconds: 0 },
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
] as const;
