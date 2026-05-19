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

import { useCallback, useState } from "react";
import { useAccount, useConnectorClient } from "wagmi";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";

import { CHAIN_INFO, SOLANA_DEVNET_CHAIN_ID } from "@/lib/wagmi";

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
 * Map our wagmi chainId to Circle's chain name string.
 * Circle SDK uses string names like "Ethereum Sepolia", "Arc Testnet", etc.
 */
function chainIdToCircleName(chainId: number): string | null {
  // Solana synthetic id
  if (chainId === SOLANA_DEVNET_CHAIN_ID) return "Solana Devnet";

  // Map from our CHAIN_INFO to Circle's naming
  const info = CHAIN_INFO[chainId];
  if (!info) return null;

  // Circle uses specific testnet names — map the common ones
  const map: Record<number, string> = {
    11155111: "Ethereum Sepolia",
    84532: "Base Sepolia",
    421614: "Arbitrum Sepolia",
    11155420: "OP Sepolia",
    80002: "Polygon PoS Amoy",
    43113: "Avalanche Fuji",
    59141: "Linea Sepolia",
    1301: "Unichain Sepolia",
    4801: "World Chain Sepolia",
    763373: "Ink Testnet",
    2810: "Morph Testnet",
    1924: "Plume Testnet",
    1328: "Sei Testnet",
    14601: "Sonic Testnet",
    98985: "Pharos Atlantic",
    685685: "Codex Testnet",
    50_002: "XDC Apothem",
    10143: "Monad Testnet",
    1338: "Edge Testnet",
    944: "Arc Testnet",
    1075: "Injective Testnet",
    998: "HyperEVM Testnet",
  };

  return map[chainId] ?? info.name;
}

export function useCircleBridge() {
  const { connector } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { connection: solanaConnection } = useConnection();
  const { wallet: solanaWallet, publicKey: solanaPublicKey } = useWallet();

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
        if (!connector || !connectorClient) {
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
          { BridgeKit, BridgeStateEnum: _ },
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

        // Get Solana provider from wallet adapter
        const solanaProvider = solanaWallet.adapter;

        const solanaAdapter = createSolanaAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: solanaProvider as any,
          connection: solanaConnection,
        });

        const kit = new BridgeKit();

        setState({ status: "bridging", steps: [] });

        const result = await kit.bridge({
          from: { adapter: evmAdapter, chain: sourceCircleName },
          to: {
            adapter: solanaAdapter,
            chain: "Solana Devnet",
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
    [connector, connectorClient, solanaConnection, solanaWallet, solanaPublicKey]
  );

  return {
    ...state,
    bridge,
    reset,
  };
}
