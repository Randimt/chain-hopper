"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bridge", label: "Bridge" },
  { href: "/swap", label: "Swap", soon: true },
  { href: "/history", label: "History" },
  { href: "/portfolio", label: "Portfolio", soon: true },
];

function shortAddress(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function TopNav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname?.startsWith(href);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/80 border-b border-white/[0.08]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
          {/* Left: Logo + Nav links */}
          <div className="flex items-center gap-8 lg:gap-10 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-base text-zinc-100 hover:text-white transition-colors shrink-0"
            >
              <div className="w-7 h-7 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white font-black text-xs">
                CH
              </div>
              <span className="hidden sm:inline">Chain Hopper</span>
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? "text-white bg-white/[0.06]"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                    }`}
                  >
                    {item.label}
                    {item.soon && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold tracking-wider uppercase">
                        Soon
                      </span>
                    )}
                    {active && (
                      <span className="absolute -bottom-[13px] left-3.5 right-3.5 h-0.5 bg-cyan-400 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: Network pill + Wallet + Mobile menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 font-medium">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
              </span>
              Testnet
            </div>

            {isConnected && address ? (
              <button
                onClick={() => disconnect()}
                className="flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-100 hover:bg-white/[0.06] transition-colors text-xs sm:text-sm font-medium"
              >
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shrink-0" />
                <span className="font-mono">{shortAddress(address)}</span>
              </button>
            ) : (
              <button
                onClick={() => openConnectModal?.()}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs sm:text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Connect
              </button>
            )}

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-100 hover:bg-white/[0.06] transition-colors"
              aria-label="Toggle menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl">
            <div className="px-4 py-3 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "text-white bg-cyan-500/10 border border-cyan-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.soon && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-wider uppercase">
                        Soon
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="md:hidden flex items-center gap-2 mt-2 px-4 py-2 text-xs text-zinc-500">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
                </span>
                Testnet · CCTP V2 ready
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
