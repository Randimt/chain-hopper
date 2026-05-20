"use client";

import type { PublicClient } from "viem";

/**
 * Wait until the public client is reachable on the target chain.
 *
 * After `switchChainAsync()`, the wallet's promise resolves before its
 * internal RPC and the underlying provider have fully propagated the new
 * chain context. Calling `writeContract()` immediately can fire against
 * a stale RPC connection and surface as "connection timeout" / "request
 * is being rate-limited" / "wrong network". This polls `getChainId()` on
 * the public client (which auto-rebinds to the active chain) until it
 * matches the target, with a small initial delay to let MetaMask settle.
 *
 * Used by useBridge, useRelayBridge, useAcrossBridge after switchChainAsync.
 */
export async function waitForChainSync(
  publicClient: PublicClient | undefined,
  targetChainId: number,
  opts: {
    initialDelayMs?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  const {
    initialDelayMs = 250,
    timeoutMs = 5000,
    pollIntervalMs = 200,
  } = opts;
  // Initial settle delay — wallet adapters propagate chain via events
  await new Promise((r) => setTimeout(r, initialDelayMs));
  if (!publicClient) return; // hook not ready, let writeContract handle

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const id = await publicClient.getChainId();
      if (id === targetChainId) return;
    } catch {
      // RPC not ready, keep polling
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  // Timed out — proceed anyway, writeContract will surface the real error
}
