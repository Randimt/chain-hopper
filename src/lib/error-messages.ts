// Friendly error messages for common Web3/CCTP errors.
// Keep concise + actionable.

const ERROR_PATTERNS: Array<{ match: RegExp | string; message: string }> = [
  { match: /user rejected|user denied|rejected the request/i, message: "Transaction cancelled in wallet" },
  { match: /insufficient funds.*gas|insufficient funds for/i, message: "Not enough native gas in wallet for this transaction" },
  { match: /insufficient allowance|exceeds allowance/i, message: "USDC allowance too low — re-approve and try again" },
  { match: /transfer amount exceeds balance/i, message: "Insufficient USDC balance on source chain" },
  { match: /chain id mismatch|chain mismatch|target chain for the transaction/i, message: "Wallet on wrong network — switch and try again" },
  { match: /nonce too low|replacement transaction/i, message: "Wallet has a stuck pending tx — check wallet activity" },
  { match: /execution reverted/i, message: "Transaction failed on-chain. Verify on explorer." },
  { match: /timeout|timed out/i, message: "Network timeout — tx may still be pending. Check explorer." },
  { match: /failed to fetch|networkerror|err_cert|network_error/i, message: "Network error contacting Circle attestation service. Retry shortly." },
  { match: /attestation timeout/i, message: "Circle attestation taking longer than usual. Resume from saved bridge later." },
  { match: /no cctp domain/i, message: "Selected chain not supported for bridging" },
  { match: /wallet not connected|account not found/i, message: "Wallet not connected" },
];

/**
 * Translate a raw error message into a friendly user-facing string.
 * Falls back to truncated raw message if no pattern matches.
 */
export function friendlyError(raw: unknown): string {
  if (!raw) return "Unknown error";
  const msg = raw instanceof Error ? raw.message : String(raw);
  for (const { match, message } of ERROR_PATTERNS) {
    if (typeof match === "string") {
      if (msg.toLowerCase().includes(match.toLowerCase())) return message;
    } else if (match.test(msg)) {
      return message;
    }
  }
  // Truncate long raw messages (viem stack traces can be huge)
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
}
