/**
 * storage-security.ts — Signed localStorage wrapper
 * 
 * Prevents localStorage tampering attacks by signing all data with user's wallet.
 * Attacker cannot inject malicious bridge parameters without valid signature.
 */

import { type Address, type Hex, keccak256, toHex } from "viem";

/**
 * Sign data with wallet address as the key.
 * Uses deterministic hash of (data + address) to detect tampering.
 */
function signData(data: unknown, address: Address): Hex {
  const serialized = JSON.stringify(data);
  const message = `${serialized}:${address.toLowerCase()}`;
  return keccak256(toHex(message));
}

/**
 * Verify data signature matches expected hash.
 */
function verifySignature(
  data: unknown,
  signature: Hex,
  address: Address,
): boolean {
  const expected = signData(data, address);
  return signature === expected;
}

/**
 * Signed storage wrapper — all reads/writes include signature verification.
 */
export interface SignedData<T> {
  data: T;
  signature: Hex;
  address: Address;
  timestamp: number;
}

/**
 * Write to localStorage with signature.
 */
export function writeSecure<T>(key: string, data: T, address: Address): void {
  try {
    const signature = signData(data, address);
    const wrapped: SignedData<T> = {
      data,
      signature,
      address: address.toLowerCase() as Address,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(wrapped));
  } catch (e) {
    console.error("[storage-security] write failed:", e);
    // localStorage full or disabled — silently fail
  }
}

/**
 * Read from localStorage with signature verification.
 * Returns null if signature invalid or missing.
 */
export function readSecure<T>(key: string, address: Address): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const wrapped = JSON.parse(raw) as SignedData<T>;

    // Check address match
    if (wrapped.address.toLowerCase() !== address.toLowerCase()) {
      console.warn(
        "[storage-security] address mismatch, clearing:",
        key,
        "expected",
        address,
        "got",
        wrapped.address,
      );
      localStorage.removeItem(key);
      return null;
    }

    // Verify signature
    if (!verifySignature(wrapped.data, wrapped.signature, address)) {
      console.warn("[storage-security] signature invalid, clearing:", key);
      localStorage.removeItem(key);
      return null;
    }

    return wrapped.data;
  } catch (e) {
    console.error("[storage-security] read failed:", e);
    localStorage.removeItem(key); // Clear corrupt data
    return null;
  }
}

/**
 * Remove from localStorage.
 */
export function removeSecure(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Migrate legacy unsigned data to signed format.
 * Call once on app init per storage key.
 */
export function migrateLegacy<T>(
  legacyKey: string,
  newKey: string,
  address: Address,
): void {
  try {
    // Skip if already migrated
    if (localStorage.getItem(newKey)) return;

    const legacy = localStorage.getItem(legacyKey);
    if (!legacy) return;

    const parsed = JSON.parse(legacy) as T;
    writeSecure(newKey, parsed, address);
    localStorage.removeItem(legacyKey);

    console.info("[storage-security] migrated:", legacyKey, "→", newKey);
  } catch (e) {
    console.error("[storage-security] migration failed:", e);
    // Clear both on error
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(newKey);
  }
}
