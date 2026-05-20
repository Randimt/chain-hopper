/**
 * Bridge history storage helpers.
 * Stores completed/failed bridges per wallet address in localStorage.
 *
 * Schema versioned for future migration when Phase 2 (multi-aggregator) lands.
 */

const HISTORY_KEY = "chain-hopper:history";
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
}

function storageKey(address: string): string {
  return `${HISTORY_KEY}:${address.toLowerCase()}`;
}

export function loadBridgeHistory(address?: string): BridgeRecord[] {
  if (typeof window === "undefined" || !address) return [];
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
