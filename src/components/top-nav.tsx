"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import toast from "react-hot-toast";
import { CHAIN_INFO } from "@/lib/wagmi";
import { SolanaWalletButton } from "@/components/solana-wallet-button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bridge", label: "Bridge" },
  { href: "/recipes", label: "Recipes", beta: true },
  { href: "/batch", label: "Batch", soon: true },
  { href: "/swap", label: "Swap", soon: true },
  { href: "/history", label: "History" },
];

function shortAddress(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function TopNav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname?.startsWith(href);
  };

  // Close wallet menu on outside click + ESC
  useEffect(() => {
    if (!walletMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalletMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [walletMenuOpen]);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Failed to copy");
    }
    setWalletMenuOpen(false);
  };

  const handleDisconnect = () => {
    disconnect();
    setWalletMenuOpen(false);
    toast.success("Wallet disconnected");
  };

  const explorerUrl = (() => {
    if (!address || !chainId) return null;
    const explorer = CHAIN_INFO[chainId]?.explorer;
    if (!explorer) return null;
    return `${explorer}/address/${address}`;
  })();

  const chainName = chainId ? CHAIN_INFO[chainId]?.name : null;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/80 border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Logo + Nav links */}
        <div className="flex items-center gap-8 lg:gap-10 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 h-9 font-bold text-base text-zinc-100 hover:text-white transition-colors shrink-0"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white font-black text-xs">
              L
            </div>
            <span className="hidden sm:inline leading-none">Lyxsa</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1 h-9">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative h-9 flex items-center px-3.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "text-white bg-white/[0.06]"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                  }`}
                >
                  {item.label}
                  {item.soon && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold tracking-wider uppercase leading-none">
                      Soon
                    </span>
                  )}
                  {item.beta && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-bold tracking-wider uppercase leading-none">
                      Beta
                    </span>
                  )}
                  {active && (
                    <span className="absolute left-3.5 right-3.5 -bottom-[14px] h-0.5 bg-cyan-400 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: Network pill + Settings + Wallet + Mobile menu */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 font-medium">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
            </span>
            <span className="leading-none">Testnet</span>
          </div>

          <SolanaWalletButton />

          {isConnected && address ? (
            <div className="relative" ref={walletMenuRef}>
              <button
                onClick={() => setWalletMenuOpen((prev) => !prev)}
                className={`flex items-center gap-2 h-9 px-3 sm:px-3.5 rounded-lg border transition-colors text-xs sm:text-sm font-medium ${
                  walletMenuOpen
                    ? "bg-white/[0.08] border-white/[0.16] text-white"
                    : "bg-white/[0.04] border-white/[0.08] text-zinc-100 hover:bg-white/[0.06]"
                }`}
                aria-expanded={walletMenuOpen}
                aria-haspopup="menu"
              >
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shrink-0" />
                <span className="font-mono leading-none">{shortAddress(address)}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-zinc-400 transition-transform ${walletMenuOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {walletMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-zinc-900 border border-white/[0.08] shadow-2xl shadow-black/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  {/* Header — full address + chain */}
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
                          Connected wallet
                        </div>
                        {chainName && (
                          <div className="text-xs text-zinc-300 truncate">{chainName}</div>
                        )}
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-zinc-400 break-all leading-relaxed">
                      {address}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="py-1">
                    <button
                      role="menuitem"
                      onClick={handleCopy}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.04] transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span className="leading-none">Copy address</span>
                    </button>

                    {explorerUrl && (
                      <a
                        role="menuitem"
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setWalletMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.04] transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        <span className="leading-none flex-1 text-left">View on explorer</span>
                      </a>
                    )}
                  </div>

                  {/* Disconnect */}
                  <div className="border-t border-white/[0.06] py-1">
                    <button
                      role="menuitem"
                      onClick={handleDisconnect}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span className="leading-none">Disconnect</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => openConnectModal?.()}
              className="h-9 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs sm:text-sm font-semibold hover:-translate-y-px hover:shadow-lg hover:shadow-cyan-500/20 transition-all leading-none"
            >
              Connect
            </button>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-100 hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  {item.beta && (
                    <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold tracking-wider uppercase">
                      Beta
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
  );
}
