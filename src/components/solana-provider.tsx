"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import { useMemo, useEffect, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

export const SOLANA_DEVNET_RPC = clusterApiUrl("devnet");

// USDC mint address on Solana Devnet
export const SOLANA_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * Detects locked wallet state on page load and auto-disconnects.
 *
 * When user locks Phantom but doesn't disconnect from dApp:
 *   - autoConnect tries to restore session
 *   - wallet.adapter.connected becomes true briefly
 *   - But signing fails because wallet is locked
 *
 * This component polls the underlying provider for unlock state.
 * If wallet is locked at mount time, force disconnect to avoid
 * misleading "connected" UI when the wallet can't actually sign.
 */
function LockedWalletGuard() {
  const { connected, disconnect, wallet } = useWallet();

  useEffect(() => {
    if (!connected || !wallet) return;

    // Check if Phantom provider has locked state
    // window.solana.isConnected reflects actual unlock state
    const checkLockState = async () => {
      try {
        const provider = (window as unknown as { solana?: { isConnected?: boolean; publicKey?: unknown } }).solana;
        if (provider && provider.isConnected === false) {
          // Wallet is locked — force disconnect from dApp
          console.warn("[Lyxsa] Solana wallet locked — auto-disconnecting");
          await disconnect();
        }
      } catch {
        // Silent fail — provider might not expose isConnected
      }
    };

    // Initial check after mount
    const initialTimer = setTimeout(checkLockState, 500);

    // Periodic check (every 30s) for lock state changes
    const interval = setInterval(checkLockState, 30000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [connected, disconnect, wallet]);

  return null;
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <LockedWalletGuard />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
