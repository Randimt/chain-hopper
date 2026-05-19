"use client";

/**
 * Hook for EVM → Solana bridging via Circle's official Bridge Kit.
 *
 * Why this hook exists:
 *   The homegrown CCTP V2 Solana implementation (useBridge + useSolanaReceive)
 *   hit multiple low-level bugs that proved hard to debug (PDA derivation,
 *   message offset bytes, account ordering, IDL discriminator, wallet
 *   preflight stripping). Circle ships @circle-fin/bridge-kit as the official
 *   SDK that handles all of that internally.
 *
 *   We use BridgeKit ONLY for EVM → Solana. EVM → EVM keeps the existing
 *   useBridge flow because it's already working, supports multi-aggregator
 *   (Relay, Across), and the homegrown EVM CCTP V2 path is well-tested.
 *
 * Flow:
 *   1. User picks source EVM chain + dest Solana Devnet + amount
 *   2. We grab MetaMask EIP1193 provider via wagmi connector
 *   3. We grab Phantom/Backpack/etc Solana provider via wallet-adapter
 *   4. Build viem adapter + Solana adapter + BridgeKit instance
 *   5. Call kit.bridge({ from, to, amount, config: { transferSpeed: 'FAST' } })
 *   6. SDK handles: depositForBurn → attestation poll → Solana receiveMessage
 *      Each step prompts the appropriate wallet (MetaMask then Phantom).
 *   7. Return BridgeResult with full step history for UI display.
 */

import { useCallback, useState, useMemo } from "react";
import { useAccount } from "wagmi";
import {
  useWallet,
  useConnection,
  type WalletContextState,
} from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

import { SOLANA_DEVNET_CHAIN_ID } from "@/lib/wagmi";

/**
 * Wrap @solana/wallet-adapter-react state into the shape Circle SDK expects:
 *   { isConnected, publicKey, connect(), disconnect(), signTransaction(), signMessage() }
 *
 * The wallet-adapter `wallet.adapter` object exposes similar methods but with a
 * slightly different shape (no isConnected getter, publicKey is a getter).
 * Circle's SolanaAdapter validates `provider.isConnected` as a required field.
 */
function buildSolanaProvider(wallet: WalletContextState) {
  return {
    get isConnected() {
      return Boolean(wallet.connected && wallet.publicKey);
    },
    get publicKey() {
      return wallet.publicKey
        ? { toString: () => wallet.publicKey!.toBase58() }
        : undefined;
    },
    async connect() {
      if (!wallet.connected) {
        await wallet.connect();
      }
      if (!wallet.publicKey) {
        throw new Error("Solana wallet has no public key after connect");
      }
      return { publicKey: { toString: () => wallet.publicKey!.toBase58() } };
    },
    async disconnect() {
      await wallet.disconnect();
    },
    async signTransaction(
      tx: Transaction | VersionedTransaction
    ): Promise<Transaction | VersionedTransaction> {
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support signTransaction");
      }
      return wallet.signTransaction(tx);
    },
    async signAllTransactions(
      txs: (Transaction | VersionedTransaction)[]
    ): Promise<(Transaction | VersionedTransaction)[]> {
      if (!wallet.signAllTransactions) {
        throw new Error("Wallet does not support signAllTransactions");
      }
      return wallet.signAllTransactions(txs);
    },
    async signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }> {
      if (!wallet.signMessage) {
        throw new Error("Wallet does not support signMessage");
      }
      const sig = await wallet.signMessage(msg);
      return { signature: sig };
    },
  };
}

export type CircleBridgeStatus =
  | "idle"
  | "preparing"
  | "bridging"
  | "complete"
  | "error";

export interface CircleBridgeStep {
  name: string;
  state: "pending" | "success" | "error";
  txHash?: string;
  explorerUrl?: string;
  errorMessage?: string;
}

export interface CircleBridgeState {
  status: CircleBridgeStatus;
  steps: CircleBridgeStep[];
  error?: string;
}

export interface UseCircleBridgeArgs {
  sourceChainId: number;
  amount: string; // human-readable USDC amount (e.g. "0.1")
  /** Solana wallet pubkey to receive USDC. Defaults to connected Phantom address. */
  recipientAddress?: string;
}

/**
 * Map our wagmi chainId to Circle's BridgeChain enum value.
 * Circle SDK uses underscore_separated names like "Ethereum_Sepolia".
 */
function chainIdToCircleName(chainId: number): string | null {
  // Solana synthetic id
  if (chainId === SOLANA_DEVNET_CHAIN_ID) return "Solana_Devnet";

  const map: Record<number, string> = {
    11155111: "Ethereum_Sepolia",
    84532: "Base_Sepolia",
    421614: "Arbitrum_Sepolia",
    11155420: "Optimism_Sepolia",
    80002: "Polygon_Amoy_Testnet",
    43113: "Avalanche_Fuji",
    59141: "Linea_Sepolia",
    1301: "Unichain_Sepolia",
    4801: "World_Chain_Sepolia",
    763373: "Ink_Testnet",
    2810: "Morph_Testnet",
    1924: "Plume_Testnet",
    1328: "Sei_Testnet",
    14601: "Sonic_Testnet",
    98985: "Pharos_Testnet",
    685685: "Codex_Testnet",
    50_002: "XDC_Apothem",
    10143: "Monad_Testnet",
    1338: "Edge_Testnet",
    944: "Arc_Testnet",
    1075: "Injective_Testnet",
    998: "HyperEVM_Testnet",
  };

  return map[chainId] ?? null;
}

export function useCircleBridge() {
  const { connector } = useAccount();
  const { connection: solanaConnection } = useConnection();
  const wallet = useWallet();
  const { wallet: solanaWallet, publicKey: solanaPublicKey } = wallet;

  // Memoize the wrapper so it's stable across renders (Circle SDK may keep refs)
  const solanaProvider = useMemo(
    () => buildSolanaProvider(wallet),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallet.connected, wallet.publicKey, solanaWallet?.adapter]
  );

  const [state, setState] = useState<CircleBridgeState>({
    status: "idle",
    steps: [],
  });

  const reset = useCallback(() => {
    setState({ status: "idle", steps: [] });
  }, []);

  const bridge = useCallback(
    async ({ sourceChainId, amount, recipientAddress }: UseCircleBridgeArgs) => {
      try {
        setState({ status: "preparing", steps: [] });

        // Validate prerequisites
        if (!connector) {
          throw new Error("EVM wallet not connected");
        }
        if (!solanaWallet?.adapter) {
          throw new Error("Connect a Solana wallet (Phantom/Backpack/Solflare) first");
        }
        if (!solanaPublicKey) {
          throw new Error("Solana wallet has no public key — try reconnecting");
        }

        const sourceCircleName = chainIdToCircleName(sourceChainId);
        if (!sourceCircleName) {
          throw new Error(`Source chain ${sourceChainId} not supported by Circle SDK`);
        }

        // Lazy-load SDK — keeps initial bundle smaller for non-Solana flows
        const [
          { BridgeKit },
          { createViemAdapterFromProvider },
          { createSolanaAdapterFromProvider },
        ] = await Promise.all([
          import("@circle-fin/bridge-kit"),
          import("@circle-fin/adapter-viem-v2"),
          import("@circle-fin/adapter-solana"),
        ]);

        // Get EIP1193 provider from wagmi connector (MetaMask, Rabby, etc.)
        const eip1193Provider = await connector.getProvider();

        const evmAdapter = await createViemAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: eip1193Provider as any,
        });

        // Solana adapter expects a SolanaWalletProvider-shaped object
        // (with isConnected, publicKey, connect, disconnect, signTransaction).
        // Our wrapper adapts wallet-adapter-react state to that shape.
        const solanaAdapter = createSolanaAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: solanaProvider as any,
          connection: solanaConnection,
        });

        const kit = new BridgeKit();

        setState({ status: "bridging", steps: [] });

        const result = await kit.bridge({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          from: { adapter: evmAdapter as any, chain: sourceCircleName as any },
          to: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            adapter: solanaAdapter as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chain: "Solana_Devnet" as any,
            ...(recipientAddress && recipientAddress !== solanaPublicKey.toBase58()
              ? { recipientAddress }
              : {}),
          },
          amount,
          config: { transferSpeed: "FAST" },
        });

        // Map SDK steps to our UI shape
        const steps: CircleBridgeStep[] = (result.steps ?? []).map((s) => ({
          name: s.name,
          state: s.state as "pending" | "success" | "error",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          txHash: (s as any).txHash,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          explorerUrl: (s as any).explorerUrl,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorMessage: (s as any).errorMessage,
        }));

        if (result.state === "success") {
          setState({ status: "complete", steps });
        } else if (result.state === "error") {
          const failedStep = steps.find((s) => s.state === "error");
          setState({
            status: "error",
            steps,
            error:
              failedStep?.errorMessage ??
              "Bridge failed during execution — check step details",
          });
        } else {
          // pending / unknown
          setState({ status: "bridging", steps });
        }

        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[useCircleBridge] error:", e);
        setState({
          status: "error",
          steps: [],
          error: msg.slice(0, 300),
        });
        throw e;
      }
    },
    [connector, solanaConnection, solanaWallet, solanaPublicKey, solanaProvider]
  );

  return {
    ...state,
    bridge,
    reset,
  };
}
