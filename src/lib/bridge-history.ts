/**
 * Bridge history storage helpers.
 * Stores completed/failed bridges per wallet address in localStorage.
 *
 * Schema versioned for future migration when Phase 2 (multi-aggregator) lands.
 */

const HISTORY_KEY = "lyxsa:history";
const LEGACY_HISTORY_KEY = "chain-hopper:history"; // pre-rebrand
const MAX_RECORDS = 50; // Cap to avoid localStorage quota issues

export type BridgeProvider = "cctp" | "relay" | "across" | "lifi";
export type BridgeStatus = "complete" | "failed" | "pending";

export interface BridgeRecord {
  id: string;
  provider: BridgeProvider;
  sourceChain: number;
  destChain: number;
  amount: string;
  status: BridgeStatus;
  approveTxHash?: `0x${string}`;
  burnTxHash?: `0x${string}`;
  mintTxHash?: `0x${string}`;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  /** Stage 6 Task 7: recipe context tagging — set when bridge fired from recipe queue */
  recipeId?: string;
  recipeName?: string;
  recipeOutputIndex?: number;
  recipeTotalOutputs?: number;
  /** Reclaim flow: Solana recipient (base58 pubkey) when destination is Solana — needed to rebuild receiveMessage tx */
  solanaRecipient?: string;
  /** Reclaim flow: marker — true if record was created via "Discard" on a pending burn (not via failure) */
  reclaimable?: boolean;
}

function storageKey(address: string): string {
  return `${HISTORY_KEY}:${address.toLowerCase()}`;
}

function legacyStorageKey(address: string): string {
  return `${LEGACY_HISTORY_KEY}:${address.toLowerCase()}`;
}

/**
 * Migrate legacy "chain-hopper:history" entries to "lyxsa:history" once.
 * Idempotent — safe to call repeatedly.
 */
function migrateLegacyHistory(address: string): void {
  if (typeof window === "undefined") return;
  try {
    const newKey = storageKey(address);
    const oldKey = legacyStorageKey(address);
    // If new key already has data, no migration needed
    if (localStorage.getItem(newKey)) return;
    const legacyData = localStorage.getItem(oldKey);
    if (!legacyData) return;
    localStorage.setItem(newKey, legacyData);
    localStorage.removeItem(oldKey);
    if (process.env.NODE_ENV === "development") {
      console.log(`[lyxsa] Migrated history for ${address.slice(0, 6)}...`);
    }
  } catch {
    /* ignore migration errors — legacy data preserved */
  }
}

export function loadBridgeHistory(address?: string): BridgeRecord[] {
  if (typeof window === "undefined" || !address) return [];
  migrateLegacyHistory(address); // run-once auto migration
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBridgeHistory(address: string, records: BridgeRecord[]) {
  try {
    // Keep only the latest MAX_RECORDS
    const trimmed = records.slice(-MAX_RECORDS);
    localStorage.setItem(storageKey(address), JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

export function addBridgeRecord(address: string, record: BridgeRecord) {
  const existing = loadBridgeHistory(address);
  // Dedupe by id (update from pending → complete) AND by burnTxHash (resume case:
  // new "complete" record overrides previous "failed" record for same on-chain burn).
  const filtered = existing.filter((r) => {
    if (r.id === record.id) return false;
    if (record.burnTxHash && r.burnTxHash && r.burnTxHash === record.burnTxHash) {
      return false;
    }
    return true;
  });
  saveBridgeHistory(address, [...filtered, record]);
}

export function clearBridgeHistory(address: string) {
  try {
    localStorage.removeItem(storageKey(address));
  } catch {
    /* ignore */
  }
}

export function generateBridgeId(): string {
  return `br_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
