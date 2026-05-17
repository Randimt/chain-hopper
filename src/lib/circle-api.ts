// Circle Iris API (CCTP V2 attestation service)
// Sandbox endpoint for testnet operations
// Docs: https://developers.circle.com/cctp/cctp-apis

// Fetch directly from Circle Iris API.
// Iris supports CORS (access-control-allow-origin: *), so no proxy needed.
const CIRCLE_IRIS_TESTNET = "https://iris-api-sandbox.circle.com/v2";

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
 * Poll Circle Iris API for attestation after depositForBurn.
 * Returns when attestation is "complete" — message ready for receiveMessage.
 *
 * @param sourceDomain - CCTP domain ID of source chain
 * @param txHash - Transaction hash of depositForBurn
 * @param signal - AbortSignal for cancellation
 * @param onProgress - Callback for status updates
 */
export async function pollAttestation(
  sourceDomain: number,
  txHash: `0x${string}`,
  signal?: AbortSignal,
  onProgress?: (status: string, attempt: number) => void
): Promise<AttestationResponse> {
  const url = `${CIRCLE_IRIS_TESTNET}/messages/${sourceDomain}?transactionHash=${txHash}`;

  // Poll every 5s, max 20 minutes (240 attempts)
  const MAX_ATTEMPTS = 240;
  const INTERVAL_MS = 5000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new Error("Attestation polling cancelled");
    }

    try {
      const res = await fetch(url, { signal });

      if (res.ok) {
        const data = (await res.json()) as { messages?: IrisApiMessage[] };
        const message = data.messages?.[0];

        if (message?.status === "complete" && message.message && message.attestation) {
          return {
            message: message.message as `0x${string}`,
            attestation: message.attestation as `0x${string}`,
            status: "complete",
          };
        }

        onProgress?.(message?.status ?? "pending", attempt);
      } else {
        // Log non-200 to console for debugging
        console.warn(`[Iris] HTTP ${res.status} on attempt ${attempt}`, {
          url,
          status: res.status,
          statusText: res.statusText,
        });
        onProgress?.(`http_${res.status}`, attempt);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      // Log network errors to console with details
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Iris] Fetch failed on attempt ${attempt}:`, errMsg, err);
      onProgress?.(`fetch_error: ${errMsg.slice(0, 50)}`, attempt);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  throw new Error(
    "Attestation timeout (20 min). You can claim manually later from the same wallet."
  );
}
