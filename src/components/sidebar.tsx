"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
  disabled?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "📊" },
      { href: "/bridge", label: "Bridge", icon: "🌉" },
      { href: "/swap", label: "Swap", icon: "💱", badge: "soon" },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/history", label: "History", icon: "📜" },
      { href: "/portfolio", label: "Portfolio", icon: "📈", badge: "soon" },
    ],
  },
];

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === item.href;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
        isActive
          ? "bg-cyan-500/10 text-cyan-400 border-l-[3px] border-cyan-500 pl-[9px]"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      <span className="text-base">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="text-[10px] px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded-full font-normal">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <>
      {/* Logo */}
      <Link href="/" onClick={onNav} className="flex items-center gap-2.5 px-2 py-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-base">
          ⚡
        </div>
        <span className="font-bold text-base bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
          Chain Hopper
        </span>
      </Link>

      {/* Nav sections */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold px-3 pb-2">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} onClick={onNav} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Wallet footer */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        {isConnected && address ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="font-mono text-xs text-zinc-200">
                {shortAddress(address)}
              </span>
            </div>
            <button
              onClick={() => disconnect()}
              className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="px-1">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/85 backdrop-blur-xl border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-sm">
              ⚡
            </div>
            <span className="font-bold text-sm bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Chain Hopper
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-zinc-400 hover:text-zinc-200 p-2"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={closeMobile}
          />
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-zinc-950 border-r border-zinc-800 z-50 p-4 flex flex-col">
            <SidebarContent onNav={closeMobile} />
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 sticky top-0 h-screen bg-zinc-950 border-r border-zinc-800 p-4 flex-col">
        <SidebarContent />
      </aside>
    </>
  );
}
