"use client";

/**
 * Hook for cross-VM USDC bridging via Circle's official Bridge Kit.
 *
 * Supports BOTH directions:
 *   - EVM → Solana  (sourceChainId = EVM, destChainId = Solana_Devnet)
 *   - Solana → EVM  (sourceChainId = Solana_Devnet, destChainId = EVM)
 *
 * Why this hook exists:
 *   The homegrown CCTP V2 Solana implementation (useBridge + useSolanaReceive)
 *   hit multiple low-level bugs that proved hard to debug (PDA derivation,
 *   message offset bytes, account ordering, IDL discriminator, wallet
 *   preflight stripping). Circle ships @circle-fin/bridge-kit as the official
 *   SDK that handles all of that internally.
 *
 *   We use BridgeKit ONLY when one side is Solana. EVM ↔ EVM keeps the existing
 *   useBridge flow because it's already working, supports multi-aggregator
 *   (Relay, Across), and the homegrown EVM CCTP V2 path is well-tested.
 *
 * Flow (EVM → Solana):
 *   1. User picks source EVM chain + dest Solana Devnet + amount
 *   2. We grab MetaMask EIP1193 provider via wagmi connector
 *   3. We grab Phantom/Backpack/etc Solana provider via wallet-adapter
 *   4. Build viem adapter + Solana adapter + BridgeKit instance
 *   5. Call kit.bridge({ from: evm, to: solana, amount })
 *   6. SDK: depositForBurn (MetaMask) → attestation poll → receiveMessage (Phantom)
 *
 * Flow (Solana → EVM):
 *   1. User picks Solana Devnet source + dest EVM chain + amount
 *   2. Same adapter setup, but swap from/to
 *   3. Call kit.bridge({ from: solana, to: evm, amount })
 *   4. SDK: depositForBurn (Phantom) → attestation poll → receiveMessage (MetaMask)
 *   5. Recipient defaults to MetaMask address
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
  destChainId: number;
  amount: string; // human-readable USDC amount (e.g. "0.1")
  /** Recipient address on dest chain. Defaults to connected wallet on that side. */
  recipientAddress?: string;
}

/**
 * Map our wagmi chainId to Circle's BridgeChain enum value.
 * Circle SDK uses underscore_separated names like "Ethereum_Sepolia".
 */
function chainIdToCircleName(chainId: number): string | null {
  if (chainId === SOLANA_DEVNET_CHAIN_ID) return "Solana_Devnet";

  const map: Record<number, string> = {
    11155111: "Ethereum_Sepolia",
    84532: "Base_Sepolia",
    421614: "Arbitrum_Sepolia",
    11155420: "Optimism_Sepolia",
    80002: "Polygon_Amoy_Testnet",
    43113: "Avalanche_Fuji",
    1301: "Unichain_Sepolia",
    59141: "Linea_Sepolia",
    10143: "Monad_Testnet",
    98867: "Plume_Testnet",
    763373: "Ink_Testnet",
    4801: "World_Chain_Sepolia",
    57054: "Sonic_Testnet",
    1328: "Sei_Testnet",
    688688: "Pharos_Testnet",
    5042002: "Arc_Testnet",
    812242: "Codex_Testnet",
    998: "HyperEVM_Testnet",
    1439: "Injective_Testnet",
    51: "XDC_Apothem",
    2910: "Morph_Testnet",
    33431: "Edge_Testnet",
  };

  return map[chainId] ?? null;
}

function isSolana(chainId: number) {
  return chainId === SOLANA_DEVNET_CHAIN_ID;
}

export function useCircleBridge() {
  const { connector, address: evmAddress } = useAccount();
  const { connection: solanaConnection } = useConnection();
  const wallet = useWallet();
  const { wallet: solanaWallet, publicKey: solanaPublicKey } = wallet;

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
    async ({ sourceChainId, destChainId, amount, recipientAddress }: UseCircleBridgeArgs) => {
      try {
        setState({ status: "preparing", steps: [] });

        const sourceIsSolana = isSolana(sourceChainId);
        const destIsSolana = isSolana(destChainId);

        // Validate prerequisites — both wallets needed for cross-VM
        if (!connector) {
          throw new Error("EVM wallet not connected (MetaMask/Rabby)");
        }
        if (!evmAddress) {
          throw new Error("EVM wallet has no address — try reconnecting");
        }
        if (!solanaWallet?.adapter) {
          throw new Error("Connect a Solana wallet (Phantom/Backpack/Solflare) first");
        }
        if (!solanaPublicKey) {
          throw new Error("Solana wallet has no public key — try reconnecting");
        }

        const sourceCircleName = chainIdToCircleName(sourceChainId);
        const destCircleName = chainIdToCircleName(destChainId);
        if (!sourceCircleName) {
          throw new Error(`Source chain ${sourceChainId} not supported by Circle SDK`);
        }
        if (!destCircleName) {
          throw new Error(`Destination chain ${destChainId} not supported by Circle SDK`);
        }
        if (sourceIsSolana && destIsSolana) {
          throw new Error("Solana → Solana is not supported");
        }
        if (!sourceIsSolana && !destIsSolana) {
          throw new Error("Use the EVM bridge flow for EVM → EVM transfers");
        }

        // Lazy-load SDK
        const [
          { BridgeKit, SolanaDevnet },
          { createViemAdapterFromProvider },
          { createSolanaAdapterFromProvider },
        ] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          import("@circle-fin/bridge-kit") as any,
          import("@circle-fin/adapter-viem-v2"),
          import("@circle-fin/adapter-solana"),
        ]);

        if (!SolanaDevnet) {
          throw new Error(
            "Circle SDK SolanaDevnet chain definition missing — package version mismatch"
          );
        }

        // Build EVM adapter
        const eip1193Provider = await connector.getProvider();
        const evmAdapter = await createViemAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: eip1193Provider as any,
        });

        // Build Solana adapter (must await — it's async)
        const solanaAdapter = await createSolanaAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: solanaProvider as any,
          connection: solanaConnection,
          capabilities: {
            addressContext: "user-controlled",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supportedChains: [SolanaDevnet] as any,
          },
        });

        const kit = new BridgeKit();

        setState({ status: "bridging", steps: [] });

        // Build from/to based on direction
        const fromAdapter = sourceIsSolana ? solanaAdapter : evmAdapter;
        const toAdapter = destIsSolana ? solanaAdapter : evmAdapter;

        // Default recipient based on direction
        const defaultRecipient = destIsSolana
          ? solanaPublicKey.toBase58()
          : evmAddress;
        const finalRecipient = recipientAddress ?? defaultRecipient;

        const result = await kit.bridge({
          from: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            adapter: fromAdapter as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chain: sourceCircleName as any,
          },
          to: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            adapter: toAdapter as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chain: destCircleName as any,
            ...(finalRecipient && finalRecipient !== defaultRecipient
              ? { recipientAddress: finalRecipient }
              : {}),
          },
          amount,
          config: { transferSpeed: "FAST" },
        });

        const steps: CircleBridgeStep[] = (result.steps ?? []).map((s: { name: string; state: string }) => ({
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
    [connector, evmAddress, solanaConnection, solanaWallet, solanaPublicKey, solanaProvider]
  );

  return {
    ...state,
    bridge,
    reset,
  };
}
