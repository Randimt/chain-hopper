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
  // Dedupe by id only (update from pending → complete).
  //
  // NOTE: We deliberately do NOT dedupe by burnTxHash anymore — batch bridges
  // produce N records that all share the same burnTxHash but route to different
  // destinations. groupRecordsByBatchTx() is the source of truth for batch UX.
  // For single-tx flows, burnTxHash is unique by construction so this is safe.
  const filtered = existing.filter((r) => r.id !== record.id);
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

// ─────────────────────────────────────────────────────────────────────────────
// Batch detection helpers (Approach C — unified /batch recovery hub)
//
// A "batch" record is one of N records that share the same burnTxHash,
// each routing to a different destination chain. The /batch route handles
// recovery for these (single-tx records keep using /bridge).
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchGroup {
  burnTxHash: `0x${string}`;
  sourceChain: number;
  /** All records sharing this burnTxHash (one per destination chain) */
  legs: BridgeRecord[];
  totalAmount: number;
  startedAt: number;
  /** Earliest record id in the group — useful as stable key */
  primaryId: string;
}

/**
 * Group history records by burnTxHash. Records WITHOUT burnTxHash (e.g.
 * complete records that never had reclaim flow saved) are skipped from grouping.
 *
 * Returns a Map keyed by burnTxHash. Single-tx records that happen to be alone
 * in their group are still included — caller decides whether to treat them
 * as batch or single via `isBatchRecord`.
 */
export function groupRecordsByBatchTx(
  records: BridgeRecord[],
): Map<`0x${string}`, BatchGroup> {
  const groups = new Map<`0x${string}`, BatchGroup>();
  for (const r of records) {
    if (!r.burnTxHash) continue;
    const existing = groups.get(r.burnTxHash);
    if (existing) {
      existing.legs.push(r);
      existing.totalAmount += Number(r.amount) || 0;
      existing.startedAt = Math.min(existing.startedAt, r.startedAt);
    } else {
      groups.set(r.burnTxHash, {
        burnTxHash: r.burnTxHash,
        sourceChain: r.sourceChain,
        legs: [r],
        totalAmount: Number(r.amount) || 0,
        startedAt: r.startedAt,
        primaryId: r.id,
      });
    }
  }
  return groups;
}

/**
 * Determine whether a record belongs to a multi-leg batch (vs a single-tx bridge).
 *
 * Heuristic: if 2+ records in the same address history share this record's
 * burnTxHash, it's a batch leg. Otherwise it's a standalone single-tx bridge.
 *
 * Recipe-queue records also share recipeId but each leg has its OWN burnTxHash
 * (sequential queue, not atomic batch) — so they correctly classify as "single".
 */
export function isBatchRecord(
  record: BridgeRecord,
  allRecords: BridgeRecord[],
): boolean {
  if (!record.burnTxHash) return false;
  const sameTxCount = allRecords.filter(
    (r) => r.burnTxHash === record.burnTxHash,
  ).length;
  return sameTxCount >= 2;
}

/**
 * Find all records sharing a batch tx hash (siblings of a known batch leg).
 * Returns empty array if record is not a batch leg.
 */
export function findBatchSiblings(
  burnTxHash: `0x${string}`,
  allRecords: BridgeRecord[],
): BridgeRecord[] {
  return allRecords.filter((r) => r.burnTxHash === burnTxHash);
}

/**
 * Aggregate batch group status from per-leg statuses.
 * - "complete" if ALL legs are complete
 * - "failed" if ANY leg is failed AND no leg is pending
 * - "pending" if any leg is still in flight
 */
export function deriveBatchStatus(
  group: BatchGroup,
): "complete" | "failed" | "pending" {
  const statuses = group.legs.map((r) => r.status);
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.some((s) => s === "pending")) return "pending";
  if (statuses.some((s) => s === "failed")) return "failed";
  return "pending";
}

/**
 * Reclaim destination router — pick the right route for a Reclaim button.
 *
 * - Batch leg (siblings exist) → /batch?recover=<burnTxHash>
 * - Single-tx → /bridge?reclaim=<recordId>  (existing flow, no change)
 *
 * Recipe-queue legs go through /bridge (each leg is independent single-tx).
 */
export function getReclaimRoute(
  record: BridgeRecord,
  allRecords: BridgeRecord[],
): { href: string; mode: "batch" | "single" } {
  if (record.burnTxHash && isBatchRecord(record, allRecords)) {
    return {
      href: `/batch?recover=${record.burnTxHash}`,
      mode: "batch",
    };
  }
  return {
    href: `/bridge?reclaim=${record.id}`,
    mode: "single",
  };
}
