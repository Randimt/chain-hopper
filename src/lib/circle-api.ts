// Circle Iris API (CCTP V2 attestation service)
// Sandbox endpoint for testnet operations
// Docs: https://developers.circle.com/cctp/cctp-apis

// Direct Iris endpoint — works from server/curl, but some browsers
// (specific edge regions) hit ERR_CERT_COMMON_NAME_INVALID due to
// rotating SSL certs at Circle. Fall back to our backend proxy.
const CIRCLE_IRIS_TESTNET = "https://iris-api-sandbox.circle.com/v2";
const PROXY_PATH = "/api/iris";

export interface AttestationResponse {
  message: `0x${string}`;
  attestation: `0x${string}`;
  status: "pending_confirmations" | "complete";
}

interface IrisApiMessage {
  message: string;
  attestation: string;
  status: string;
  eventNonce?: string;
}

/**
 * Try direct Iris API first; if it fails (CORS/SSL/network), retry via backend proxy.
 */
async function fetchIris(
  sourceDomain: number,
  txHash: `0x${string}`,
  signal?: AbortSignal,
  preferProxy = false
): Promise<{ ok: boolean; status: number; data?: { messages?: IrisApiMessage[] }; via: "direct" | "proxy"; error?: string }> {
  const directUrl = `${CIRCLE_IRIS_TESTNET}/messages/${sourceDomain}?transactionHash=${txHash}`;
  const proxyUrl = `${PROXY_PATH}?domain=${sourceDomain}&txHash=${txHash}`;

  const tryFetch = async (url: string, label: "direct" | "proxy") => {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = (await res.json()) as { messages?: IrisApiMessage[] };
        return { ok: true, status: res.status, data, via: label };
      }
      return { ok: false, status: res.status, via: label };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      return {
        ok: false,
        status: 0,
        via: label,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  if (!preferProxy) {
    const directResult = await tryFetch(directUrl, "direct");
    if (directResult.ok || directResult.status >= 400) {
      // Direct succeeded OR got a real HTTP response (not network failure)
      return directResult;
    }
    // Direct fetch had network/SSL/CORS issue — fall back to proxy
  }

  return tryFetch(proxyUrl, "proxy");
}

/**
 * Poll Iris API for attestation after depositForBurn.
 * Tries direct fetch first, falls back to backend proxy if browser blocks.
 */
export async function pollAttestation(
  sourceDomain: number,
  txHash: `0x${string}`,
  signal?: AbortSignal,
  onProgress?: (status: string, attempt: number) => void
): Promise<AttestationResponse> {
  // Poll every 5s, max 20 minutes (240 attempts)
  const MAX_ATTEMPTS = 240;
  const INTERVAL_MS = 5000;

  // Track proxy preference: once we know direct fails, skip retrying it
  let preferProxy = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new Error("Attestation polling cancelled");
    }

    const result = await fetchIris(sourceDomain, txHash, signal, preferProxy);

    // Latch to proxy if direct ever fails — avoid retrying broken direct
    if (!preferProxy && result.via === "proxy") {
      preferProxy = true;
      console.info("[Iris] Switched to backend proxy after direct fetch failed");
    }

    if (result.ok && result.data) {
      const message = result.data.messages?.[0];
      if (
        message?.status === "complete" &&
        message.message &&
        message.attestation
      ) {
        return {
          message: message.message as `0x${string}`,
          attestation: message.attestation as `0x${string}`,
          status: "complete",
        };
      }
      onProgress?.(message?.status ?? "pending", attempt);
    } else {
      // Surface the actual error to UI for debugging
      const status = result.error
        ? `fetch_error (${result.via})`
        : `http_${result.status} (${result.via})`;
      console.warn(
        `[Iris] Attempt ${attempt} failed via ${result.via}:`,
        result.error || `HTTP ${result.status}`
      );
      onProgress?.(status, attempt);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  throw new Error(
    "Attestation timeout (20 min). You can claim manually later from the same wallet.",
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stage 8 — Multi-attestation tracking for Phase 4 batch bridge.
// 1 batch tx → N MessageSent events → N attestations to track in parallel.
// ─────────────────────────────────────────────────────────────────────────

export type LegAttestation =
  | { status: "pending"; attempt: number }
  | { status: "complete"; message: `0x${string}`; attestation: `0x${string}` }
  | { status: "error"; error: string };

/**
 * Single fetch (no polling) to get current state of all attestations
 * for a batch tx. Used by hook to drive parallel polling per leg.
 */
export async function fetchBatchAttestations(
  sourceDomain: number,
  batchTxHash: `0x${string}`,
  expectedCount: number,
  signal?: AbortSignal,
): Promise<LegAttestation[]> {
  const result = await fetchIris(sourceDomain, batchTxHash, signal, false);
  if (!result.ok || !result.data) {
    return Array(expectedCount).fill({
      status: "pending",
      attempt: 0,
    } as LegAttestation);
  }
  const messages = result.data.messages ?? [];
  const slots: LegAttestation[] = [];
  for (let i = 0; i < expectedCount; i++) {
    const m = messages[i];
    if (m?.status === "complete" && m.message && m.attestation) {
      slots.push({
        status: "complete",
        message: m.message as `0x${string}`,
        attestation: m.attestation as `0x${string}`,
      });
    } else {
      slots.push({ status: "pending", attempt: 0 });
    }
  }
  return slots;
}
