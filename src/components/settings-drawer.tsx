"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BridgeSettings,
  DEFAULT_SETTINGS,
  REFRESH_PRESETS,
  SLIPPAGE_PRESETS,
  isValidAddress,
  loadSettings,
  saveSettings,
} from "@/lib/bridge-settings";
import { PROVIDER_INFO, QuoteProvider } from "@/lib/quotes/types";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const [settings, setSettings] = useState<BridgeSettings>(DEFAULT_SETTINGS);
  const [customSlippageStr, setCustomSlippageStr] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Mount detection (for SSR-safe portal)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load settings on mount + when drawer opens
  useEffect(() => {
    setSettings(loadSettings());
  }, [open]);

  // Outside click + ESC to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  const updateSettings = (next: Partial<BridgeSettings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    saveSettings(merged);
  };

  const handleSlippagePreset = (bps: number) => {
    setCustomSlippageStr("");
    updateSettings({ slippageBps: bps });
  };

  const handleCustomSlippage = (value: string) => {
    setCustomSlippageStr(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0 && num <= 50) {
      updateSettings({ slippageBps: Math.round(num * 100) });
    }
  };

  const handleRecipientChange = (value: string) => {
    updateSettings({ customRecipient: value.trim() });
  };

  const toggleProvider = (provider: QuoteProvider) => {
    updateSettings({
      enabledProviders: {
        ...settings.enabledProviders,
        [provider]: !settings.enabledProviders[provider],
      },
    });
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setCustomSlippageStr("");
  };

  const slippagePct = settings.slippageBps / 100;
  const isCustomSlippage = !SLIPPAGE_PRESETS.some(
    (p) => p.bps === settings.slippageBps,
  );
  const recipientValid =
    !settings.customRecipient || isValidAddress(settings.customRecipient);

  if (!open || !mounted) return null;

  const drawerContent = (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm">
      <div
        ref={drawerRef}
        className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Bridge Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Experimental Routes Toggle — HIDDEN: testnet liquidity unreliable, defer to mainnet */}
          {/*
          <section className="space-y-3">
            <label className="flex items-start gap-3 p-4 rounded-md border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={settings.experimentalRoutes}
                onChange={() =>
                  updateSettings({
                    experimentalRoutes: !settings.experimentalRoutes,
                  })
                }
                className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/30"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">
                    Show alternative routes
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                    Experimental
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  Enable Relay, Across, and LiFi for route comparison. Testnet
                  liquidity is unreliable — most routes will say{" "}
                  <span className="text-zinc-300">no route</span> or have low max
                  amounts. Stable on mainnet.
                </p>
              </div>
            </label>
          </section>
          */}

          {/* Slippage */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Slippage Tolerance
              </h3>
              <span className="text-sm text-zinc-200 tabular-nums">
                {slippagePct.toFixed(2)}%
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset.bps}
                  type="button"
                  onClick={() => handleSlippagePreset(preset.bps)}
                  className={`px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                    settings.slippageBps === preset.bps && !customSlippageStr
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Custom %"
                value={customSlippageStr}
                onChange={(e) => handleCustomSlippage(e.target.value)}
                min="0"
                max="50"
                step="0.1"
                className={`w-full rounded-md border bg-zinc-900 px-3 py-2 pr-10 text-sm text-zinc-200 focus:outline-none ${
                  isCustomSlippage && customSlippageStr
                    ? "border-cyan-500"
                    : "border-zinc-800 focus:border-zinc-700"
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                %
              </span>
            </div>
            {settings.slippageBps > 300 && (
              <p className="text-xs text-amber-400">
                ⚠ High slippage — risk of unfavorable execution
              </p>
            )}
            <p className="text-xs text-zinc-500 leading-relaxed">
              CCTP guarantees zero slippage. Relay/Across honor minimum receive.
            </p>
          </section>

          {/* Custom Recipient */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
              Recipient Address
            </h3>
            <input
              type="text"
              placeholder="0x... (leave empty to use your wallet)"
              value={settings.customRecipient}
              onChange={(e) => handleRecipientChange(e.target.value)}
              className={`w-full rounded-md border bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-200 focus:outline-none ${
                settings.customRecipient && !recipientValid
                  ? "border-red-500"
                  : "border-zinc-800 focus:border-zinc-700"
              }`}
            />
            {settings.customRecipient && !recipientValid && (
              <p className="text-xs text-red-400">
                Invalid address format
              </p>
            )}
            <p className="text-xs text-zinc-500 leading-relaxed">
              Send bridged USDC to a different wallet. Useful for cold-storage or
              account separation.
            </p>
          </section>

          {/* Provider Preferences (only when experimental routes enabled) */}
          {settings.experimentalRoutes && (
            <section className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Bridge Providers
              </h3>
              <div className="space-y-2">
                {(["cctp", "relay", "across", "lifi"] as QuoteProvider[]).map(
                  (provider) => {
                    const info = PROVIDER_INFO[provider];
                    const enabled = settings.enabledProviders[provider];
                    return (
                      <label
                        key={provider}
                        className="flex items-center gap-3 p-3 rounded-md border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleProvider(provider)}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/30"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${info.badgeColor}`}
                            >
                              {info.shortName}
                            </span>
                            <span className="text-sm text-zinc-200 truncate">
                              {info.name}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {info.description}
                          </div>
                        </div>
                      </label>
                    );
                  },
                )}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Disabled providers won&apos;t appear in route comparison. CCTP
                always remains active.
              </p>
            </section>
          )}

          {/* Quote Auto-Refresh */}
          <section className="space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
              Quote Refresh
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {REFRESH_PRESETS.map((preset) => (
                <button
                  key={preset.seconds}
                  type="button"
                  onClick={() =>
                    updateSettings({ autoRefreshSec: preset.seconds })
                  }
                  className={`px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                    settings.autoRefreshSec === preset.seconds
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              How often quotes refresh. Lower intervals show fresher rates but
              consume more API quota.
            </p>
          </section>

          {/* Reset */}
          <section className="pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="w-full px-4 py-2 rounded-md border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              Reset to defaults
            </button>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
