"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import toast from "react-hot-toast";

export function SolanaWalletButton() {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click + ESC
  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="h-9 inline-flex items-center gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 px-3 text-xs font-medium transition-colors"
        title="Connect Solana wallet"
      >
        <span className="text-base leading-none">🟢</span>
        <span className="hidden sm:inline">Connect Solana</span>
        <span className="sm:hidden">SOL</span>
      </button>
    );
  }

  const address = publicKey?.toBase58() ?? "";
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    toast.success("Solana address copied");
    setMenuOpen(false);
  };

  const handleExplorer = () => {
    window.open(
      `https://explorer.solana.com/address/${address}?cluster=devnet`,
      "_blank"
    );
    setMenuOpen(false);
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success("Solana wallet disconnected");
    setMenuOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={`h-9 inline-flex items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
          menuOpen
            ? "border-purple-500/60 bg-purple-500/20 text-purple-200"
            : "border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200"
        }`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={`Solana: ${address}`}
      >
        <span className="text-base leading-none">🟢</span>
        <span className="font-mono">{shortAddress}</span>
        <svg
          className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] w-72 rounded-lg border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-zinc-800/50">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
              Connected via {wallet?.adapter.name ?? "Solana"}
            </div>
            <div className="text-[10px] text-purple-400 mt-0.5">Solana Devnet</div>
            <div className="font-mono text-xs text-zinc-300 mt-2 break-all">
              {address}
            </div>
          </div>

          <button
            onClick={handleCopy}
            role="menuitem"
            className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800/60 inline-flex items-center gap-3 transition-colors"
          >
            <span className="text-base">📋</span>
            <span>Copy address</span>
          </button>

          <button
            onClick={handleExplorer}
            role="menuitem"
            className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-800/60 inline-flex items-center gap-3 transition-colors"
          >
            <span className="text-base">↗</span>
            <span>View on Solana Explorer</span>
          </button>

          <div className="border-t border-zinc-800/50">
            <button
              onClick={handleDisconnect}
              role="menuitem"
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 inline-flex items-center gap-3 transition-colors"
            >
              <span className="text-base">⤴</span>
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
