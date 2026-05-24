"use client";

/**
 * Hook for same-chain token swap via Circle's official Swap Kit.
 *
 * Why this hook exists:
 *   Lyxsa's bridge primitives (useBridge, useBatchBridge, useCircleBridge)
 *   handle cross-chain USDC movement. This hook adds same-chain SWAP
 *   capability — e.g. USDC ↔ EURC ↔ cirBTC on Arc Testnet.
 *
 * Mirrors useCircleBridge pattern:
 *   - Lazy-load Circle SDK (smaller bundle)
 *   - Build Viem adapter from wagmi connector
 *   - Map our wagmi chainId → Circle chain enum name
 *   - Single method call: kit.swap({ from, tokenIn, tokenOut, amountIn, config })
 *
 * Testnet limits (per Circle docs):
 *   - Arc Testnet only supports Swap (USDC, EURC, cirBTC)
 *   - Other testnets: Swap not yet available — must use mainnet
 *
 * Flow:
 *   1. User picks chain + tokenIn + tokenOut + amount
 *   2. Validate connector + supported chain
 *   3. Build viem adapter from EIP-1193 provider
 *   4. Call kit.swap(...) with kit key from env
 *   5. Track step state (preparing → swapping → complete | error)
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

export type CircleSwapStatus =
  | "idle"
  | "preparing"
  | "swapping"
  | "complete"
  | "error";

export interface CircleSwapStep {
  name: string;
  state: "pending" | "success" | "error";
  txHash?: string;
  explorerUrl?: string;
  errorMessage?: string;
}

export interface CircleSwapState {
  status: CircleSwapStatus;
  steps: CircleSwapStep[];
  error?: string;
  /** Estimated output amount returned by SDK (if available pre-execution) */
  estimatedOut?: string;
}

export type SwapToken = "USDC" | "EURC" | "cirBTC";

export interface UseCircleSwapArgs {
  chainId: number;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string; // human-readable amount (e.g. "1.00")
}

/**
 * Map our wagmi chainId to Circle's swap-supported chain enum name.
 * Currently only Arc Testnet supports Swap on testnet.
 */
function chainIdToCircleSwapName(chainId: number): string | null {
  // Arc Testnet — the only testnet supporting Swap
  if (chainId === 5042002) return "Arc_Testnet";
  return null;
}

export function useCircleSwap() {
  const { connector, address: evmAddress } = useAccount();

  const [state, setState] = useState<CircleSwapState>({
    status: "idle",
    steps: [],
  });

  const reset = useCallback(() => {
    setState({ status: "idle", steps: [] });
  }, []);

  const swap = useCallback(
    async ({ chainId, tokenIn, tokenOut, amountIn }: UseCircleSwapArgs) => {
      try {
        setState({ status: "preparing", steps: [] });

        // Validate prerequisites
        if (!connector) {
          throw new Error("Wallet not connected");
        }
        if (!evmAddress) {
          throw new Error("Wallet has no address — try reconnecting");
        }
        if (tokenIn === tokenOut) {
          throw new Error("tokenIn and tokenOut must differ");
        }
        if (!amountIn || Number(amountIn) <= 0) {
          throw new Error("Amount must be greater than zero");
        }

        const circleChainName = chainIdToCircleSwapName(chainId);
        if (!circleChainName) {
          throw new Error(
            `Chain ${chainId} does not support Swap on testnet. Currently only Arc Testnet (5042002) is supported.`,
          );
        }

        const kitKey =
          process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ||
          // Fallback hardcoded kit key — App Kit keys are client-side credentials
          // (same exposure model as WalletConnect Project ID). Cloudflare Pages
          // Encrypted Secrets aren't bundled into the client build, so we ship
          // the public kit key in source. Rotate at console.circle.com if leaked.
          "KIT_KEY:747378986a9198e8b76e958f1408ea6f:f39ddddb36e88c4c1f751a7f8525ddd6";
        if (!kitKey) {
          throw new Error(
            "Circle Kit Key missing. Set NEXT_PUBLIC_CIRCLE_KIT_KEY in .env.local",
          );
        }

        // Lazy-load SDK
        const [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { SwapKit } = {} as any,
          { createViemAdapterFromProvider },
        ] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          import("@circle-fin/swap-kit") as any,
          import("@circle-fin/adapter-viem-v2"),
        ]);

        // Build EVM adapter from wagmi's connector
        const eip1193Provider = await connector.getProvider();
        const evmAdapter = await createViemAdapterFromProvider({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: eip1193Provider as any,
        });

        const kit = new SwapKit();

        setState({ status: "swapping", steps: [] });

        const result = await kit.swap({
          from: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            adapter: evmAdapter as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chain: circleChainName as any,
          },
          tokenIn,
          tokenOut,
          amountIn,
          config: {
            kitKey,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawSteps = (result as any).steps ?? [];
        const steps: CircleSwapStep[] = rawSteps.map(
          (s: { name: string; state: string }) => ({
            name: s.name,
            state: s.state as "pending" | "success" | "error",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            txHash: (s as any).txHash,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            explorerUrl: (s as any).explorerUrl,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            errorMessage: (s as any).errorMessage,
          }),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultState = (result as any).state;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const estimatedOut = (result as any).amountOut ?? (result as any).estimatedAmountOut;

        if (resultState === "success") {
          setState({ status: "complete", steps, estimatedOut });
        } else if (resultState === "error") {
          const failedStep = steps.find((s) => s.state === "error");
          setState({
            status: "error",
            steps,
            error:
              failedStep?.errorMessage ??
              "Swap failed during execution — check step details",
          });
        } else {
          setState({ status: "swapping", steps });
        }

        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[useCircleSwap] error:", e);
        setState({
          status: "error",
          steps: [],
          error: msg.slice(0, 300),
        });
        throw e;
      }
    },
    [connector, evmAddress],
  );

  return {
    ...state,
    swap,
    reset,
  };
}
