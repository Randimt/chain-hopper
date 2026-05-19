"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from "@solana/spl-token";

import { SOLANA_USDC_MINT } from "@/components/solana-provider";

const USDC_DECIMALS = 6;

export function useSolanaUsdcBalance() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalance("0");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const usdcMint = new PublicKey(SOLANA_USDC_MINT);
      const ata = await getAssociatedTokenAddress(usdcMint, publicKey);

      try {
        const account = await getAccount(connection, ata);
        const raw = account.amount;
        const formatted = (Number(raw) / 10 ** USDC_DECIMALS).toFixed(2);
        setBalance(formatted);
      } catch (e) {
        // Account doesn't exist = no USDC yet
        if (e instanceof TokenAccountNotFoundError) {
          setBalance("0");
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch balance");
      setBalance("0");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, connected]);

  useEffect(() => {
    fetchBalance();
    if (!connected) return;

    // Auto-refresh every 30s
    const interval = setInterval(fetchBalance, 30_000);
    return () => clearInterval(interval);
  }, [fetchBalance, connected]);

  return {
    balance,
    loading,
    error,
    address: publicKey?.toBase58() ?? null,
    connected,
    refetch: fetchBalance,
  };
}
