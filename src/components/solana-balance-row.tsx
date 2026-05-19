"use client";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSolanaUsdcBalance } from "@/hooks/useSolanaBalance";

export function SolanaBalanceRow() {
  const { balance, loading, connected, address } = useSolanaUsdcBalance();
  const { setVisible } = useWalletModal();

  const amount = parseFloat(balance);
  const shortAddr = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";

  return (
    <div className="mb-3 px-3 py-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl">🟢</span>
        <div className="min-w-0">
          <div className="text-sm flex items-center gap-2 flex-wrap">
            <span className="text-zinc-100">Solana Devnet</span>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-semibold">
              View only
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            {connected
              ? `Phantom · ${shortAddr}`
              : "Connect Phantom to view balance"}
          </div>
        </div>
      </div>

      {connected ? (
        <span className="font-mono text-sm tabular-nums text-zinc-100 whitespace-nowrap">
          {loading ? "..." : `${amount.toFixed(2)} USDC`}
        </span>
      ) : (
        <button
          onClick={() => setVisible(true)}
          className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 px-2.5 py-1 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors whitespace-nowrap"
        >
          Connect
        </button>
      )}
    </div>
  );
}
