"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSearchParams, useRouter } from "next/navigation";
import { erc20Abi, formatUnits } from "viem";
import { sepolia, baseSepolia } from "wagmi/chains";
import toast from "react-hot-toast";
import { ChainSelector } from "./chain-selector";
import { TxTracker } from "./tx-tracker";
import { QuoteList } from "./quote-list";
import { SettingsDrawer } from "./settings-drawer";
import { CHAIN_INFO, USDC_ADDRESSES, SOLANA_DEVNET_CHAIN_ID } from "@/lib/wagmi";
import { isSolanaChain } from "@/lib/cctp";
import { useBridge } from "@/hooks/useBridge";
import { useCircleBridge } from "@/hooks/useCircleBridge";
import { useSolanaUsdcBalance } from "@/hooks/useSolanaBalance";
import { useRelayBridge } from "@/hooks/useRelayBridge";
import { useAcrossBridge } from "@/hooks/useAcrossBridge";
import { useSolanaReceive } from "@/hooks/useSolanaReceive";
import { useQuotes } from "@/hooks/useQuotes";
import { parseUSDC, QuoteProvider, PROVIDER_INFO } from "@/lib/quotes/types";
import { addBridgeRecord, generateBridgeId, loadBridgeHistory, type BridgeRecord } from "@/lib/bridge-history";
import { useRecipes } from "@/hooks/useRecipes";
import {
  loadRecipeQueue,
  advanceRecipeQueue,
  clearRecipeQueue,
  isQueueComplete,
  type RecipeQueueState,
} from "@/lib/recipes-storage";

const STORAGE_KEY = "lyxsa:pending-bridge";
const LEGACY_STORAGE_KEY = "chain-hopper:pending-bridge"; // pre-rebrand

interface PendingBridge {
  sourceChain: number;
  destChain: number;
  amount: string;
  burnTxHash: `0x${string}`;
  timestamp: number;
  solanaRecipient?: string;
}

function loadPendingBridge(address?: string): PendingBridge | null {
  if (typeof window === "undefined" || !address) return null;
  try {
    const newKey = `${STORAGE_KEY}:${address.toLowerCase()}`;
    const oldKey = `${LEGACY_STORAGE_KEY}:${address.toLowerCase()}`;
    // Auto-migrate legacy key (run once)
    if (!localStorage.getItem(newKey)) {
      const legacy = localStorage.getItem(oldKey);
      if (legacy) {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(oldKey);
      }
    }
    const raw = localStorage.getItem(newKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePendingBridge(address: string, data: PendingBridge) {
  try {
    localStorage.setItem(
      `${STORAGE_KEY}:${address.toLowerCase()}`,
      JSON.stringify(data),
    );
  } catch {
    /* quota / private mode */
  }
}

function clearPendingBridge(address: string) {
  try {
    localStorage.removeItem(`${STORAGE_KEY}:${address.toLowerCase()}`);
  } catch {
    /* ignore */
  }
}

function shortHash(hash: `0x${string}`) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function TxLink({
  hash,
  chainId,
  label,
}: {
  hash: `0x${string}`;
  chainId: number;
  label: string;
}) {
  const explorer = CHAIN_INFO[chainId]?.explorer;
  const url = explorer ? `${explorer}/tx/${hash}` : "#";
  return (
    <p className="truncate flex items-center gap-2">
      <span className="text-zinc-500">{label}:</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
      >
        {shortHash(hash)} ↗
      </a>
    </p>
  );
}

export function BridgeForm() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { markRun } = useRecipes();
  const [sourceChain, setSourceChain] = useState<number>(sepolia.id);
  const [destChain, setDestChain] = useState<number>(baseSepolia.id);
  const [amount, setAmount] = useState<string>("");
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [activeRecipeName, setActiveRecipeName] = useState<string | null>(null);
  const [activeQueue, setActiveQueue] = useState<RecipeQueueState | null>(null);
  const recipeRunMarkedRef = useRef(false);
  const [pendingBridge, setPendingBridge] = useState<PendingBridge | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<QuoteProvider | null>(null);
  const [userPickedProvider, setUserPickedProvider] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const { state, approve, bridge, resume, reset, markSolanaReceiveComplete } = useBridge();
  const circleBridge = useCircleBridge();
  const {
    state: relayState,
    bridge: relayBridge,
    reset: relayReset,
  } = useRelayBridge();
  const {
    state: acrossState,
    bridge: acrossBridge,
    reset: acrossReset,
  } = useAcrossBridge();
  const {
    prepare: solanaPrepare,
    signAndSend: solanaSignAndSend,
    reset: solanaReceiveReset,
    status: solanaReceiveStatus,
    txSignature: solanaReceiveTxSig,
    error: solanaReceiveError,
    needsAtaCreation: solanaNeedsAta,
  } = useSolanaReceive();
  const { publicKey: solanaPublicKey, connected: solanaConnected } = useWallet();
  const recordIdRef = useRef<string | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const recordMetaRef = useRef<{
    sourceChain: number;
    destChain: number;
    amount: string;
    provider: QuoteProvider;
  } | null>(null);

  // ============ Quote fetching ============
  const amountWei = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) return "0";
    return parseUSDC(amount);
  }, [amount]);

  const quoteRequest = useMemo(() => {
    if (!isConnected || amountWei === "0") return null;
    return {
      sourceChain,
      destChain,
      amountIn: amountWei,
      sender: address,
    };
  }, [isConnected, sourceChain, destChain, amountWei, address]);

  const { quotes, bestByReceive, bestBySpeed, isLoading: quotesLoading } =
    useQuotes(quoteRequest);

  // Auto-select best provider when quotes load (unless user manually picked)
  useEffect(() => {
    if (quotes.length === 0 || userPickedProvider) return;
    const available = quotes.filter((q) => q.status === "available");
    if (available.length === 0) {
      setSelectedProvider(null);
      return;
    }
    if (selectedProvider) {
      const stillValid = available.find((q) => q.provider === selectedProvider);
      if (stillValid) return;
    }
    // Default to bestByReceive
    if (bestByReceive) setSelectedProvider(bestByReceive);
    else setSelectedProvider(available[0].provider);
  }, [quotes, bestByReceive, selectedProvider, userPickedProvider]);

  // Reset user-picked flag when amount/chains change (re-enable smart default)
  useEffect(() => {
    setUserPickedProvider(false);
  }, [sourceChain, destChain]);

  // Listen for "set source chain" event from balance list (compact balances click)
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<number>;
      const target = custom.detail;
      if (typeof target !== "number") return;
      // If user picks current dest, swap chains instead of duplicating
      if (target === destChain) {
        setDestChain(sourceChain);
      }
      setSourceChain(target);
    };
    window.addEventListener("plix:set-source-chain", handler);
    return () => window.removeEventListener("plix:set-source-chain", handler);
  }, [sourceChain, destChain]);

  // Recipe prefill — read URL params on mount + when params change
  useEffect(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const amountParam = searchParams.get("amount");
    const recipeId = searchParams.get("recipeId");
    const recipeName = searchParams.get("recipeName");
    const reclaimParam = searchParams.get("reclaim");

    if (fromParam) {
      const fromNum = Number(fromParam);
      if (!Number.isNaN(fromNum)) setSourceChain(fromNum);
    }
    if (toParam) {
      const toNum = Number(toParam);
      if (!Number.isNaN(toNum)) setDestChain(toNum);
    }
    if (amountParam) {
      // Validate is a positive number-ish string
      if (/^\d+(\.\d+)?$/.test(amountParam) && Number(amountParam) > 0) {
        setAmount(amountParam);
      }
    }
    if (recipeId) {
      setActiveRecipeId(recipeId);
      setActiveRecipeName(recipeName || "Recipe");
      recipeRunMarkedRef.current = false; // reset on new recipe load
    } else {
      setActiveRecipeId(null);
      setActiveRecipeName(null);
      setActiveQueue(null);
    }

    // Reclaim flow: load history record by ID, restore as pendingBridge state.
    // User clicked "Reclaim" on a discarded/orphaned burn from /history.
    if (reclaimParam && address) {
      const records = loadBridgeHistory(address);
      const record = records.find((r) => r.id === reclaimParam);
      if (record && record.burnTxHash && record.status === "pending") {
        setSourceChain(record.sourceChain);
        setDestChain(record.destChain);
        setAmount(record.amount);
        const pending: PendingBridge = {
          sourceChain: record.sourceChain,
          destChain: record.destChain,
          amount: record.amount,
          burnTxHash: record.burnTxHash,
          timestamp: record.startedAt,
          solanaRecipient: record.solanaRecipient,
        };
        savePendingBridge(address, pending);
        setPendingBridge(pending);
        toast.success("Reclaim ready — click Resume Bridge to mint", {
          duration: 5000,
          id: "reclaim-ready",
        });
        // Strip the reclaim param so refresh doesn't double-trigger
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.delete("reclaim");
        const queryString = newParams.toString();
        router.replace(queryString ? `/bridge?${queryString}` : "/bridge");
      } else if (record && record.status !== "pending") {
        toast.error("This bridge is no longer reclaimable (already complete)", {
          id: "reclaim-error",
        });
      } else {
        toast.error("Reclaim record not found in your history", {
          id: "reclaim-error",
        });
      }
    }
  }, [searchParams, address]);

  // Load active queue from localStorage when recipe context active
  useEffect(() => {
    if (!address || !activeRecipeId) {
      setActiveQueue(null);
      return;
    }
    const queue = loadRecipeQueue(address);
    // Only show queue UI if it matches the current recipe
    if (queue && queue.recipeId === activeRecipeId) {
      setActiveQueue(queue);
    } else {
      setActiveQueue(null);
    }
  }, [address, activeRecipeId]);

  // Advance queue helper — called after bridge complete
  const advanceQueueAndRedirect = useCallback(() => {
    if (!address || !activeQueue) return;

    // Reset bridge states FIRST so UI shows "Bridge" button, not "Bridge Again",
    // when next output's URL prefill kicks in. Prevents user from clicking
    // "Bridge Again" (which wipes amount) before realizing auto-advance happened.
    reset();
    relayReset();
    acrossReset();
    setSelectedProvider(null);
    setUserPickedProvider(false);
    recipeRunMarkedRef.current = false; // re-arm markRun for next output

    const updated = advanceRecipeQueue(address, "completed");
    if (!updated || isQueueComplete(updated)) {
      // Queue done — clear and toast
      if (address) clearRecipeQueue(address);
      toast.success(
        `🎉 Recipe complete · ${activeQueue.outputs.length}/${activeQueue.outputs.length} outputs`,
        { duration: 6000, id: "recipe-queue-done" }
      );
      // Strip URL params, stay on bridge page
      setTimeout(() => {
        router.replace("/bridge");
      }, 1500);
      return;
    }
    // More outputs — redirect to next
    const nextOutput = updated.outputs[updated.currentIndex];
    const params = new URLSearchParams({
      from: String(updated.sourceChainId),
      to: String(nextOutput.destChainId),
      amount: nextOutput.amount,
      recipeId: updated.recipeId,
      recipeName: updated.recipeName,
    });
    toast.success(
      `✓ Output ${updated.currentIndex} of ${updated.outputs.length} done · advancing…`,
      { duration: 3000, id: "recipe-queue-advance" }
    );
    setTimeout(() => {
      router.push(`/bridge?${params.toString()}`);
    }, 1500);
  }, [address, activeQueue, router, reset, relayReset, acrossReset]);

  const handleSelectProvider = (provider: QuoteProvider) => {
    setSelectedProvider(provider);
    setUserPickedProvider(true);
  };

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.provider === selectedProvider) ?? null,
    [quotes, selectedProvider],
  );

  // Load pending bridge from localStorage on mount / wallet change
  useEffect(() => {
    if (!address) {
      setPendingBridge(null);
      return;
    }
    const pending = loadPendingBridge(address);
    setPendingBridge(pending);
  }, [address]);

  // Save burn tx (CCTP only) to localStorage
  useEffect(() => {
    if (
      state.burnTxHash &&
      address &&
      !pendingBridge &&
      state.status === "burning"
    ) {
      const data: PendingBridge = {
        sourceChain,
        destChain,
        amount,
        burnTxHash: state.burnTxHash,
        timestamp: Date.now(),
        // For Solana destinations, capture recipient at burn time so resume
        // can rebuild the Phantom signing flow without re-prompting.
        solanaRecipient: isSolanaChain(destChain) ? solanaPublicKey?.toBase58() : undefined,
      };
      savePendingBridge(address, data);
      setPendingBridge(data);
    }
  }, [state.burnTxHash, state.status, address, pendingBridge, sourceChain, destChain, amount, solanaPublicKey]);

  // ============ Solana receive flow ============
  // Two-phase pattern to preserve user gesture for wallet popup:
  //   1. Auto-prepare tx in background (useEffect) — runs async RPC calls
  //   2. User click → signAndSend() with ZERO async work before popup
  // Why: Backpack/Phantom block signing popups if user gesture token is lost
  // through awaits. By pre-building during attestation phase, click→popup is
  // synchronous from the browser's perspective.

  // Phase 1: Auto-prepare transaction when ready (background)
  useEffect(() => {
    console.log("[bridge-form] Solana prepare effect:", {
      status: state.status,
      hasMessage: !!state.solanaMessage,
      hasAttestation: !!state.solanaAttestation,
      hasRecipient: !!state.solanaRecipient,
      solanaConnected,
      currentSolanaStatus: solanaReceiveStatus,
    });
    if (
      state.status !== "awaiting-solana-receive" ||
      !state.solanaMessage ||
      !state.solanaAttestation ||
      !state.solanaRecipient ||
      !solanaConnected
    ) {
      return;
    }
    console.log("[bridge-form] calling solanaPrepare()");
    solanaPrepare({
      messageHex: state.solanaMessage,
      attestationHex: state.solanaAttestation,
      recipient: state.solanaRecipient,
    }).catch((err) => {
      console.error("[Solana prepare] failed:", err);
    });
  }, [
    state.status,
    state.solanaMessage,
    state.solanaAttestation,
    state.solanaRecipient,
    solanaConnected,
    solanaPrepare,
    solanaReceiveStatus,
  ]);

  // Phase 2: Click handler — fires sign popup from genuine user gesture
  const triggerSolanaReceive = useCallback(() => {
    console.log("[bridge-form] triggerSolanaReceive clicked, status:", solanaReceiveStatus);
    if (!solanaConnected) {
      toast.error("Connect Phantom or Backpack first");
      return;
    }
    if (solanaReceiveStatus === "building") {
      toast.error("Transaction still preparing — try again in a sec");
      return;
    }
    // Auto-retry on error: reset hook + re-prepare from cached state.message/attestation
    if (solanaReceiveStatus === "error") {
      console.log("[bridge-form] retry: error state detected, last error:", solanaReceiveError);
      if (solanaReceiveError) {
        toast.error(`Previous error: ${solanaReceiveError}. Retrying...`, { duration: 4000 });
      }
      if (state.solanaMessage && state.solanaAttestation && solanaPublicKey) {
        const recipientStr = state.solanaRecipient ?? solanaPublicKey.toBase58();
        solanaReceiveReset();
        setTimeout(() => {
          solanaPrepare({
            messageHex: state.solanaMessage!,
            attestationHex: state.solanaAttestation!,
            recipient: recipientStr,
          });
        }, 100);
      } else {
        toast.error("Missing bridge data — refresh page and click Resume");
      }
      return;
    }
    if (solanaReceiveStatus !== "ready") {
      toast.error(`Unexpected state: ${solanaReceiveStatus} — try refresh`);
      return;
    }

    toast.loading("Awaiting wallet signature", { id: "bridge-progress" });

    // CRITICAL: signAndSend has zero async work before sendTransaction()
    // so the wallet popup opens within the user click event boundary.
    solanaSignAndSend()
      .then((sig) => {
        if (sig) {
          markSolanaReceiveComplete(sig);
        }
      })
      .catch((err) => {
        console.error("[Solana sign] failed:", err);
      });
  }, [
    solanaConnected,
    solanaReceiveStatus,
    solanaReceiveError,
    solanaSignAndSend,
    solanaPrepare,
    solanaReceiveReset,
    solanaPublicKey,
    state.solanaMessage,
    state.solanaAttestation,
    state.solanaRecipient,
    markSolanaReceiveComplete,
  ]);

  // Clear pending after CCTP complete
  useEffect(() => {
    if (state.status === "complete" && address) {
      clearPendingBridge(address);
      setPendingBridge(null);
    }
  }, [state.status, address]);

  // Reset Solana receive sub-state when main bridge resets to idle
  useEffect(() => {
    if (state.status === "idle") {
      solanaReceiveReset();
    }
  }, [state.status, solanaReceiveReset]);

  // ============ Circle Bridge Kit toast tracking (EVM → Solana) ============
  const prevCircleStatusRef = useRef<string>("idle");
  useEffect(() => {
    const prev = prevCircleStatusRef.current;
    const curr = circleBridge.status;
    if (prev !== curr) {
      if (curr === "preparing") {
        toast.loading("Preparing cross-chain bridge...", { id: "circle-bridge" });
      }
      if (curr === "bridging") {
        toast.loading("Bridge in progress — sign prompts in both wallets", {
          id: "circle-bridge",
        });
      }
      if (curr === "complete") {
        toast.success("Bridge complete — USDC delivered to Solana", {
          id: "circle-bridge",
        });
        // Mark recipe run if active (only once per run)
        if (activeRecipeId && !recipeRunMarkedRef.current) {
          markRun(activeRecipeId);
          recipeRunMarkedRef.current = true;
        }
        if (address) clearPendingBridge(address);
        // Advance queue if multi-output recipe in progress
        if (activeQueue) advanceQueueAndRedirect();
      }
      if (curr === "error") {
        toast.error(circleBridge.error ?? "Bridge failed", { id: "circle-bridge" });
      }
    }
    prevCircleStatusRef.current = curr;
  }, [circleBridge.status, circleBridge.error, address]);

  // ============ CCTP toast / history tracking ============
  const prevStatusRef = useRef<string>("idle");
  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = state.status;
    if (prev === curr) return;

    if (curr === "approved" && prev === "approving") {
      toast.success("USDC approved");
    } else if (curr === "burning" && prev !== "burning") {
      toast.loading("Burning USDC on source chain", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
      recordMetaRef.current = { sourceChain, destChain, amount, provider: "cctp" };
    } else if (curr === "attesting" && prev !== "attesting") {
      toast.loading("Waiting for Circle attestation", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
    } else if (curr === "minting" && prev !== "minting") {
      toast.loading("Minting on destination chain", { id: "bridge-progress" });
    } else if (curr === "complete") {
      toast.dismiss("bridge-progress");
      toast.success("Bridge complete — USDC minted");
      // Mark recipe run if active (only once per run)
      if (activeRecipeId && !recipeRunMarkedRef.current) {
        markRun(activeRecipeId);
        recipeRunMarkedRef.current = true;
      }
      // Advance queue if multi-output recipe in progress
      if (activeQueue) advanceQueueAndRedirect();
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "cctp" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "complete",
          approveTxHash: state.approveTxHash,
          burnTxHash: state.burnTxHash,
          mintTxHash: state.mintTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    } else if (curr === "error") {
      toast.dismiss("bridge-progress");
      toast.error(state.errorMessage || "Bridge failed");
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "cctp" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "failed",
          approveTxHash: state.approveTxHash,
          burnTxHash: state.burnTxHash,
          mintTxHash: state.mintTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          errorMessage: state.errorMessage,
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    }

    prevStatusRef.current = curr;
  }, [
    state.status,
    state.errorMessage,
    state.approveTxHash,
    state.burnTxHash,
    state.mintTxHash,
    address,
    sourceChain,
    destChain,
    amount,
  ]);

  // ============ Relay toast / history tracking ============
  const prevRelayStatusRef = useRef<string>("idle");
  useEffect(() => {
    const prev = prevRelayStatusRef.current;
    const curr = relayState.status;
    if (prev === curr) return;

    if (curr === "approving" && prev !== "approving") {
      toast.loading("Approving USDC for Relay", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
      recordMetaRef.current = { sourceChain, destChain, amount, provider: "relay" };
    } else if (curr === "depositing" && prev !== "depositing") {
      toast.loading("Submitting Relay intent", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
      if (!recordMetaRef.current) {
        recordMetaRef.current = { sourceChain, destChain, amount, provider: "relay" };
      }
    } else if (curr === "filling" && prev !== "filling") {
      toast.loading("Solver filling on destination", { id: "bridge-progress" });
    } else if (curr === "complete") {
      toast.dismiss("bridge-progress");
      toast.success("Bridge complete — USDC delivered via Relay");
      // Mark recipe run if active (only once per run)
      if (activeRecipeId && !recipeRunMarkedRef.current) {
        markRun(activeRecipeId);
        recipeRunMarkedRef.current = true;
      }
      // Advance queue if multi-output recipe in progress
      if (activeQueue) advanceQueueAndRedirect();
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "relay" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "complete",
          approveTxHash: relayState.approveTxHash,
          burnTxHash: relayState.depositTxHash,
          mintTxHash: relayState.fillTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    } else if (curr === "error") {
      toast.dismiss("bridge-progress");
      toast.error(relayState.errorMessage || "Relay bridge failed");
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "relay" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "failed",
          approveTxHash: relayState.approveTxHash,
          burnTxHash: relayState.depositTxHash,
          mintTxHash: relayState.fillTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          errorMessage: relayState.errorMessage,
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    }

    prevRelayStatusRef.current = curr;
  }, [
    relayState.status,
    relayState.errorMessage,
    relayState.approveTxHash,
    relayState.depositTxHash,
    relayState.fillTxHash,
    address,
    sourceChain,
    destChain,
    amount,
  ]);

  // ============ Across toast / history tracking ============
  const prevAcrossStatusRef = useRef<string>("idle");
  useEffect(() => {
    const prev = prevAcrossStatusRef.current;
    const curr = acrossState.status;
    if (prev === curr) return;

    if (curr === "approving" && prev !== "approving") {
      toast.loading("Approving USDC for Across", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
      recordMetaRef.current = { sourceChain, destChain, amount, provider: "across" };
    } else if (curr === "depositing" && prev !== "depositing") {
      toast.loading("Submitting Across deposit", { id: "bridge-progress" });
      if (!recordIdRef.current) {
        recordIdRef.current = generateBridgeId();
        recordStartedAtRef.current = Date.now();
      }
      if (!recordMetaRef.current) {
        recordMetaRef.current = { sourceChain, destChain, amount, provider: "across" };
      }
    } else if (curr === "filling" && prev !== "filling") {
      toast.loading("Relayer filling on destination", { id: "bridge-progress" });
    } else if (curr === "complete") {
      toast.dismiss("bridge-progress");
      toast.success("Bridge complete — USDC delivered via Across");
      // Mark recipe run if active (only once per run)
      if (activeRecipeId && !recipeRunMarkedRef.current) {
        markRun(activeRecipeId);
        recipeRunMarkedRef.current = true;
      }
      // Advance queue if multi-output recipe in progress
      if (activeQueue) advanceQueueAndRedirect();
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "across" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "complete",
          approveTxHash: acrossState.approveTxHash,
          burnTxHash: acrossState.depositTxHash,
          mintTxHash: acrossState.fillTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    } else if (curr === "error") {
      toast.dismiss("bridge-progress");
      toast.error(acrossState.errorMessage || "Across bridge failed");
      if (address && recordIdRef.current) {
        const meta = recordMetaRef.current ?? {
          sourceChain,
          destChain,
          amount,
          provider: "across" as QuoteProvider,
        };
        const record: BridgeRecord = {
          id: recordIdRef.current,
          provider: meta.provider,
          sourceChain: meta.sourceChain,
          destChain: meta.destChain,
          amount: meta.amount,
          status: "failed",
          approveTxHash: acrossState.approveTxHash,
          burnTxHash: acrossState.depositTxHash,
          mintTxHash: acrossState.fillTxHash,
          startedAt: recordStartedAtRef.current,
          completedAt: Date.now(),
          errorMessage: acrossState.errorMessage,
          ...(activeRecipeId && {
            recipeId: activeRecipeId,
            recipeName: activeRecipeName ?? undefined,
            recipeOutputIndex: activeQueue?.currentIndex,
            recipeTotalOutputs: activeQueue?.outputs.length,
          }),
        };
        addBridgeRecord(address, record);
        window.dispatchEvent(new Event("bridge-history-updated"));
        recordIdRef.current = null;
        recordMetaRef.current = null;
      }
    }

    prevAcrossStatusRef.current = curr;
  }, [
    acrossState.status,
    acrossState.errorMessage,
    acrossState.approveTxHash,
    acrossState.depositTxHash,
    acrossState.fillTxHash,
    address,
    sourceChain,
    destChain,
    amount,
  ]);

  const handleSourceChange = (chainId: number) => {
    setSourceChain(chainId);
    if (chainId === destChain) {
      const allChainIds = Object.keys(USDC_ADDRESSES).map(Number);
      const fallback = allChainIds.find((id) => id !== chainId);
      if (fallback) setDestChain(fallback);
    }
  };

  const handleFlip = () => {
    setSourceChain(destChain);
    setDestChain(sourceChain);
    setAmount("");
  };

  const sourceIsSolana = isSolanaChain(sourceChain);
  const solanaBalanceState = useSolanaUsdcBalance();

  const { data: balanceRaw } = useReadContract({
    address: USDC_ADDRESSES[sourceChain],
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChain,
    query: {
      enabled: isConnected && !!address && !sourceIsSolana,
      refetchInterval: 30_000,
    },
  });

  const balance = useMemo(() => {
    if (sourceIsSolana) {
      return parseFloat(solanaBalanceState.balance) || 0;
    }
    if (!balanceRaw) return 0;
    return parseFloat(formatUnits(balanceRaw as bigint, 6));
  }, [balanceRaw, sourceIsSolana, solanaBalanceState.balance]);

  const amountNum = parseFloat(amount) || 0;
  const hasAmount = amountNum > 0;
  const sufficientBalance = amountNum <= balance;

  const sourceInfo = CHAIN_INFO[sourceChain];
  const destInfo = CHAIN_INFO[destChain];

  // Combined processing state across all providers
  const cctpProcessing = [
    "approving",
    "burning",
    "attesting",
    "minting",
    "awaiting-solana-receive",
  ].includes(state.status);
  const relayProcessing = ["approving", "depositing", "filling"].includes(
    relayState.status,
  );
  const acrossProcessing = ["approving", "depositing", "filling"].includes(
    acrossState.status,
  );
  const solanaProcessing = ["building", "awaiting-signature", "creating-ata", "confirming-ata", "confirming"].includes(
    solanaReceiveStatus,
  );
  const circleProcessing = circleBridge.status === "preparing" || circleBridge.status === "bridging";
  const isProcessing = cctpProcessing || relayProcessing || acrossProcessing || solanaProcessing || circleProcessing;

  // CCTP-specific
  const isApproved = state.status === "approved";
  const isComplete =
    state.status === "complete" ||
    relayState.status === "complete" ||
    acrossState.status === "complete";
  const hasError =
    state.status === "error" ||
    relayState.status === "error" ||
    acrossState.status === "error";

  // ============ Action handlers ============
  const handleApprove = () => {
    if (selectedProvider !== "cctp") return;
    approve({ sourceChain });
  };

  const handleBridge = () => {
    // Cross-VM bridges (one side Solana) → route through Circle Bridge Kit
    // Bypass quote/provider selection — only CCTP supports cross-VM
    const destIsSolana = isSolanaChain(destChain);
    const sourceIsSolana = isSolanaChain(sourceChain);
    const isCrossVm = destIsSolana || sourceIsSolana;

    if (!isCrossVm && (!selectedQuote || selectedQuote.status !== "available"))
      return;

    // Read recipient from settings (validated in drawer)
    const settings =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("plix:settings") || "{}")
        : {};
    const customRecipient = settings.customRecipient;
    const recipient =
      customRecipient && /^0x[a-fA-F0-9]{40}$/.test(customRecipient)
        ? (customRecipient as `0x${string}`)
        : undefined;

    if (isCrossVm) {
      if (!hasAmount) {
        toast.error("Enter an amount to bridge");
        return;
      }
      if (!sufficientBalance) {
        toast.error("Insufficient USDC balance");
        return;
      }
      if (!solanaConnected || !solanaPublicKey) {
        toast.error(
          sourceIsSolana
            ? "Connect Solana wallet (Phantom/Backpack) first to bridge from Solana"
            : "Connect Solana wallet (Phantom/Backpack) first to bridge to Solana"
        );
        return;
      }
      if (sourceIsSolana && !address) {
        toast.error("Connect EVM wallet (MetaMask) first to receive on EVM");
        return;
      }

      // Recipient address depends on direction:
      //   EVM → Solana: recipient = Solana wallet
      //   Solana → EVM: recipient = EVM wallet (or custom EVM addr from settings)
      const finalRecipient = destIsSolana
        ? solanaPublicKey.toBase58()
        : (recipient ?? address);

      void circleBridge.bridge({
        sourceChainId: sourceChain,
        destChainId: destChain,
        amount,
        recipientAddress: finalRecipient,
      });
      return;
    }

    if (selectedProvider === "cctp") {
      bridge({
        sourceChain,
        destChain,
        amount,
        recipient,
        solanaRecipient: destIsSolana ? solanaPublicKey!.toBase58() : undefined,
      });
    } else if (selectedProvider === "relay") {
      relayBridge(selectedQuote);
    } else if (selectedProvider === "across") {
      acrossBridge(selectedQuote);
    }
  };

  const handleResume = () => {
    if (!pendingBridge) return;

    const destIsSolana = isSolanaChain(pendingBridge.destChain);

    // Solana resume requires Phantom connected (need to sign receiveMessage)
    if (destIsSolana) {
      if (!solanaConnected || !solanaPublicKey) {
        toast.error("Connect Phantom wallet first to resume Solana bridge");
        return;
      }
      // If user reconnected with a different Phantom address, warn
      const expected = pendingBridge.solanaRecipient;
      const current = solanaPublicKey.toBase58();
      if (expected && expected !== current) {
        toast.error(
          `Pending bridge expects Phantom ${expected.slice(0, 6)}... — connected to ${current.slice(0, 6)}...`
        );
        return;
      }
    }

    recordMetaRef.current = {
      sourceChain: pendingBridge.sourceChain,
      destChain: pendingBridge.destChain,
      amount: pendingBridge.amount,
      provider: "cctp",
    };
    resume({
      sourceChain: pendingBridge.sourceChain,
      destChain: pendingBridge.destChain,
      burnTxHash: pendingBridge.burnTxHash,
      solanaRecipient: pendingBridge.solanaRecipient || (destIsSolana ? solanaPublicKey?.toBase58() : undefined),
    });
  };

  const handleDiscardPending = () => {
    if (!address || !pendingBridge) {
      if (address) clearPendingBridge(address);
      setPendingBridge(null);
      reset();
      return;
    }
    // Save as RECLAIMABLE record in history before clearing pendingBridge state.
    // This way users can reclaim the orphaned burn anytime later from /history.
    try {
      addBridgeRecord(address, {
        id: generateBridgeId(),
        provider: "cctp",
        sourceChain: pendingBridge.sourceChain,
        destChain: pendingBridge.destChain,
        amount: pendingBridge.amount,
        status: "pending",
        burnTxHash: pendingBridge.burnTxHash,
        startedAt: pendingBridge.timestamp,
        solanaRecipient: pendingBridge.solanaRecipient,
        reclaimable: true,
        // Preserve recipe context if active
        recipeId: activeRecipeId || undefined,
        recipeName: activeRecipeName || undefined,
      });
      window.dispatchEvent(new Event("bridge-history-updated"));
    } catch {
      /* storage failure — proceed with clear anyway */
    }
    clearPendingBridge(address);
    setPendingBridge(null);
    reset();
    toast.success("Bridge saved for later — reclaim from History anytime", {
      duration: 5000,
    });
  };

  const handleBridgeAgain = () => {
    reset();
    relayReset();
    acrossReset();
    // Preserve amount if there's an active recipe queue (auto-advance scenario):
    // URL params will re-prefill amount but only on params change, not on state reset.
    if (!activeQueue) {
      setAmount("");
    }
    setSelectedProvider(null);
    setUserPickedProvider(false);
  };

  // Cross-VM detection
  const isCrossVm = isSolanaChain(sourceChain) || isSolanaChain(destChain);

  // CCTP needs separate Approve step — Relay/Across bundle approve into intent flow
  // Cross-VM (Solana side) skips Approve entirely (BridgeKit handles internally)
  const showApproveButton = !isCrossVm && selectedProvider === "cctp";
  const canApprove =
    !isCrossVm &&
    selectedProvider === "cctp" &&
    isConnected &&
    hasAmount &&
    sufficientBalance &&
    (state.status === "idle" || state.status === "error");
  const canBridge = isCrossVm
    ? // Cross-VM: bypass quote/provider selection, route via BridgeKit directly
      hasAmount &&
      sufficientBalance &&
      !isProcessing &&
      !isComplete &&
      solanaConnected &&
      (isSolanaChain(destChain) ? true : !!address)
    : selectedQuote?.status === "available" &&
      hasAmount &&
      sufficientBalance &&
      !isProcessing &&
      !isComplete &&
      (selectedProvider === "relay" ||
        selectedProvider === "across" ||
        isApproved); // CCTP requires pre-approve, Relay/Across don't

  if (!isConnected && !solanaConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Connect your wallet to start bridging</p>
      </div>
    );
  }

  // RESUME UI: pending CCTP bridge detected
  if (
    pendingBridge &&
    state.status === "idle" &&
    relayState.status === "idle" &&
    acrossState.status === "idle"
  ) {
    const pendingSource = CHAIN_INFO[pendingBridge.sourceChain];
    const pendingDest = CHAIN_INFO[pendingBridge.destChain];
    const minutesAgo = Math.round((Date.now() - pendingBridge.timestamp) / 60000);
    return (
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/10 p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-300">⚠ Pending Bridge Detected</p>
          <p className="text-xs text-zinc-400">
            You have an unfinished CCTP bridge from {minutesAgo} minute(s) ago.
            Resume to claim your USDC on {pendingDest.name}.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">From</span>
            <span className="text-zinc-300">{pendingSource.logo} {pendingSource.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">To</span>
            <span className="text-zinc-300">{pendingDest.logo} {pendingDest.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Amount</span>
            <span className="text-zinc-300 tabular-nums">{pendingBridge.amount} USDC</span>
          </div>
          <TxLink
            hash={pendingBridge.burnTxHash}
            chainId={pendingBridge.sourceChain}
            label="Burn"
          />
        </div>

        <div className="space-y-2">
          <button
            onClick={handleResume}
            className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium py-3 px-4 text-sm transition-colors"
          >
            Resume Bridge → Claim on {pendingDest.name}
          </button>
          <button
            onClick={handleDiscardPending}
            className="w-full rounded-lg border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 font-medium py-2 px-4 text-xs transition-colors"
          >
            Discard (claim manually later)
          </button>
        </div>
      </div>
    );
  }

  // Relay status text helper
  const relayStatusText = (() => {
    switch (relayState.status) {
      case "approving":
        return `⏳ Approving USDC on ${sourceInfo.name}...`;
      case "depositing":
        return `⏳ Submitting deposit on ${sourceInfo.name}...`;
      case "filling":
        return `⏳ ${relayState.fillStatusMessage || "Solver filling on destination"}...`;
      default:
        return null;
    }
  })();

  // Across status text helper
  const acrossStatusText = (() => {
    switch (acrossState.status) {
      case "approving":
        return `⏳ Approving USDC on ${sourceInfo.name}...`;
      case "depositing":
        return `⏳ Submitting deposit on ${sourceInfo.name}...`;
      case "filling":
        return `⏳ ${acrossState.fillStatusMessage || "Relayer filling on destination"}...`;
      default:
        return null;
    }
  })();

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6 space-y-5 sm:space-y-6">
        {/* Recipe Active Banner */}
        {activeRecipeId && (
          <div className="-mb-1 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/[0.08] to-pink-500/[0.05] p-3.5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center text-base shrink-0">
                🍳
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    Running recipe
                  </span>
                  <span className="text-[10px] text-zinc-500">·</span>
                  <span className="text-[10px] text-zinc-400">
                    {activeQueue
                      ? `Output ${activeQueue.currentIndex + 1} of ${activeQueue.outputs.length}`
                      : "Single-output mode"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-100 truncate">
                  {activeRecipeName}
                </p>
                {activeQueue && activeQueue.outputs.length > 1 ? (
                  <>
                    {/* Progress dots — adaptive: shows max 8 on mobile, all on larger screens */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {(() => {
                        const all = activeQueue.outputs;
                        // On mobile (< 640px would be ideal but we just cap visually)
                        // we keep all dots but they wrap; here we just render all and let flex-wrap handle
                        return all.map((_, idx) => {
                          const isDone = activeQueue.completedIndices.includes(idx);
                          const isSkipped = activeQueue.skippedIndices.includes(idx);
                          const isCurrent = idx === activeQueue.currentIndex;
                          return (
                            <div
                              key={idx}
                              className={`h-1.5 min-w-[16px] flex-1 max-w-[60px] rounded-full transition-all ${
                                isDone
                                  ? "bg-emerald-500"
                                  : isSkipped
                                  ? "bg-zinc-600"
                                  : isCurrent
                                  ? "bg-purple-400 animate-pulse"
                                  : "bg-zinc-700"
                              }`}
                              title={
                                isDone
                                  ? `Output ${idx + 1} complete`
                                  : isSkipped
                                  ? `Output ${idx + 1} skipped`
                                  : isCurrent
                                  ? `Output ${idx + 1} (current)`
                                  : `Output ${idx + 1} pending`
                              }
                            />
                          );
                        });
                      })()}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-2">
                      {activeQueue.completedIndices.length} of{" "}
                      {activeQueue.outputs.length} done · sign in your wallet to
                      continue
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Form prefilled from recipe. Modify if needed, then proceed
                    with the bridge.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {activeQueue && activeQueue.outputs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!address) return;
                      if (
                        !window.confirm(
                          `Skip output ${activeQueue.currentIndex + 1} of ${activeQueue.outputs.length}?`
                        )
                      ) return;
                      const updated = advanceRecipeQueue(address, "skipped");
                      if (!updated || isQueueComplete(updated)) {
                        clearRecipeQueue(address);
                        toast(
                          `Recipe queue ended · ${updated?.completedIndices.length ?? 0} of ${activeQueue.outputs.length} completed`,
                          { duration: 5000 }
                        );
                        router.replace("/bridge");
                        return;
                      }
                      const nextOutput = updated.outputs[updated.currentIndex];
                      const params = new URLSearchParams({
                        from: String(updated.sourceChainId),
                        to: String(nextOutput.destChainId),
                        amount: nextOutput.amount,
                        recipeId: updated.recipeId,
                        recipeName: updated.recipeName,
                      });
                      router.push(`/bridge?${params.toString()}`);
                    }}
                    className="text-[10px] text-zinc-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-amber-500/10 leading-none whitespace-nowrap"
                    title="Skip current output and advance"
                  >
                    Skip ⤳
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      activeQueue &&
                      activeQueue.outputs.length > 1 &&
                      !window.confirm(
                        "Cancel queue? Outputs not yet bridged will be lost."
                      )
                    ) {
                      return;
                    }
                    setActiveRecipeId(null);
                    setActiveRecipeName(null);
                    setActiveQueue(null);
                    recipeRunMarkedRef.current = false;
                    if (address) clearRecipeQueue(address);
                    // Strip recipe params from URL without reload
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("recipeId");
                      url.searchParams.delete("recipeName");
                      window.history.replaceState({}, "", url.toString());
                    }
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-white/[0.04] leading-none"
                  title={
                    activeQueue && activeQueue.outputs.length > 1
                      ? "Cancel queue"
                      : "Detach from recipe"
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between -mb-1">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 leading-none">Bridge USDC</h2>
            <p className="text-xs text-zinc-500 mt-1.5">Move USDC across testnets</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Bridge settings"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* From Chain */}
        <div className="space-y-3">
          <ChainSelector
            value={sourceChain}
            onChange={handleSourceChange}
            label="From"
            allowSolana
          />
          <div className="flex justify-between text-xs text-zinc-500 px-1">
            <span>Balance</span>
            <span className="tabular-nums text-zinc-300">
              {balance.toFixed(2)} USDC
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center -my-3">
          <button
            type="button"
            onClick={handleFlip}
            disabled={isProcessing}
            aria-label="Flip source and destination chains"
            className="group rounded-full border border-zinc-700 bg-zinc-900 w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:border-zinc-700 disabled:hover:bg-zinc-900"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 transition-transform group-hover:rotate-180"
            >
              <path d="M7 16V4M7 4L3 8M7 4L11 8" />
              <path d="M17 8v12M17 20l-4-4M17 20l4-4" />
            </svg>
          </button>
        </div>

        {/* To Chain */}
        <div className="space-y-3">
          <ChainSelector
            value={destChain}
            onChange={setDestChain}
            exclude={sourceChain}
            label="To"
            allowSolana
          />
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
              disabled={isProcessing}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 pr-20 text-base text-zinc-200 tabular-nums focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => setAmount(balance.toString())}
              disabled={balance === 0 || isProcessing}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Max
            </button>
          </div>
          {hasAmount && !sufficientBalance && (
            <p className="text-xs text-red-400">Insufficient balance</p>
          )}
        </div>

        {/* Quote List — provider comparison (EVM ↔ EVM only; cross-VM uses CCTP fixed) */}
        {hasAmount && sufficientBalance && !isCrossVm && (
          <QuoteList
            quotes={quotes}
            bestByReceive={bestByReceive}
            bestBySpeed={bestBySpeed}
            selectedProvider={selectedProvider}
            onSelectProvider={handleSelectProvider}
            isLoading={quotesLoading}
            disabled={isProcessing}
          />
        )}

        {/* Cross-VM info card — shown when one side is Solana */}
        {hasAmount && sufficientBalance && isCrossVm && (
          <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-purple-200">
              Cross-VM bridge via Circle CCTP V2
            </p>
            <p className="text-[11px] text-purple-300/80 leading-relaxed">
              {isSolanaChain(sourceChain)
                ? "Sign in your Solana wallet, then in MetaMask to receive on EVM. ~30s end-to-end."
                : "Sign in MetaMask, then your Solana wallet. ~30s end-to-end."}
            </p>
          </div>
        )}

        {/* CCTP status messages */}
        {state.status === "approving" && (
          <div className="text-xs text-blue-400 text-center">
            ⏳ Approving USDC on {sourceInfo.name}...
          </div>
        )}
        {state.status === "approved" && (
          <div className="text-xs text-green-400 text-center">
            ✓ Approved. Click &quot;Bridge&quot; to continue.
          </div>
        )}
        {state.status === "burning" && (
          <div className="text-xs text-blue-400 text-center">
            ⏳ Burning USDC on {sourceInfo.name}...
          </div>
        )}
        {state.status === "attesting" && (
          <div className="text-xs text-blue-400 text-center">
            ⏳ Waiting for Circle attestation
            {state.attestationStatus && ` (${state.attestationStatus})`}...
          </div>
        )}
        {state.status === "minting" && (
          <div className="text-xs text-blue-400 text-center">
            ⏳ Minting USDC on {destInfo.name}...
          </div>
        )}

        {/* Relay status messages */}
        {relayStatusText && (
          <div className="text-xs text-blue-400 text-center">{relayStatusText}</div>
        )}

        {/* Across status messages */}
        {acrossStatusText && (
          <div className="text-xs text-blue-400 text-center">{acrossStatusText}</div>
        )}

        {isComplete && (
          <div className="text-xs text-green-400 text-center">
            ✓ Bridge complete! USDC delivered on {destInfo.name}.
          </div>
        )}

        {state.status === "error" && state.errorMessage && (
          <div className="text-xs text-red-400 text-center break-words">
            ⚠ {state.errorMessage}
          </div>
        )}
        {relayState.status === "error" && relayState.errorMessage && (
          <div className="text-xs text-red-400 text-center break-words">
            ⚠ {relayState.errorMessage}
          </div>
        )}
        {acrossState.status === "error" && acrossState.errorMessage && (
          <div className="text-xs text-red-400 text-center break-words">
            ⚠ {acrossState.errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {!isComplete ? (
            state.status === "awaiting-solana-receive" ? (
              // Solana hand-off: requires user click to trigger wallet popup
              // (browser security blocks programmatic popups without user gesture)
              <>
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 text-xs text-purple-200 space-y-1">
                  <div className="font-medium">✓ Burn confirmed on source</div>
                  <div className="text-purple-300/80">
                    Click below and approve the transaction in your Solana wallet to mint USDC.
                  </div>
                </div>
                {solanaReceiveStatus === "error" && solanaReceiveError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 space-y-1">
                    <div className="font-medium">⚠ Transaction prep failed</div>
                    <div className="text-red-300/80 break-all">{solanaReceiveError}</div>
                    <div className="text-red-300/60 text-[10px] pt-1">
                      Click button to retry. If it keeps failing, check console (F12) for details.
                    </div>
                  </div>
                )}
                <button
                  onClick={triggerSolanaReceive}
                  disabled={!solanaConnected || solanaProcessing}
                  className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
                >
                  {!solanaConnected
                    ? "Connect Phantom or Backpack"
                    : solanaReceiveStatus === "error"
                      ? "Retry transaction"
                      : solanaReceiveStatus === "building"
                        ? "Building transaction..."
                        : solanaReceiveStatus === "creating-ata"
                          ? "Sign ATA creation (1/2)..."
                          : solanaReceiveStatus === "confirming-ata"
                            ? "Confirming ATA creation..."
                            : solanaReceiveStatus === "awaiting-signature"
                              ? solanaNeedsAta
                                ? "Sign mint transaction (2/2)..."
                                : "Awaiting wallet signature..."
                              : solanaReceiveStatus === "confirming"
                                ? "Confirming on Solana..."
                                : solanaNeedsAta
                                  ? "Sign on Solana to mint USDC (2 signatures)"
                                  : "Sign on Solana to mint USDC"}
                </button>
              </>
            ) : (
              <>
                {showApproveButton && (
                  <button
                    onClick={handleApprove}
                    disabled={!canApprove}
                    className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
                  >
                    {state.status === "approving"
                      ? "Approving..."
                      : isApproved
                        ? `✓ Approved`
                        : `Approve ${sourceInfo.name} USDC`}
                  </button>
                )}
                <button
                  onClick={handleBridge}
                  disabled={!canBridge}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-medium py-3 px-4 text-sm transition-colors"
                >
                  {circleProcessing
                    ? circleBridge.status === "preparing"
                      ? "Preparing cross-VM bridge..."
                      : "Bridging cross-VM..."
                    : cctpProcessing
                      ? state.status === "burning"
                        ? "Burning..."
                        : state.status === "attesting"
                          ? "Waiting for attestation..."
                          : state.status === "minting"
                            ? "Minting..."
                            : "Approving..."
                      : relayProcessing
                        ? relayState.status === "approving"
                          ? "Approving..."
                          : relayState.status === "depositing"
                            ? "Depositing..."
                            : "Filling..."
                        : acrossProcessing
                          ? acrossState.status === "approving"
                            ? "Approving..."
                            : acrossState.status === "depositing"
                              ? "Depositing..."
                              : "Filling..."
                          : isCrossVm
                            ? `Bridge via CCTP → ${destInfo.name}`
                            : selectedProvider === "relay"
                              ? `Bridge via Relay → ${destInfo.name}`
                              : selectedProvider === "across"
                                ? `Bridge via Across → ${destInfo.name}`
                                : selectedProvider === "cctp"
                                  ? `Bridge via CCTP → ${destInfo.name}`
                                  : "Select a route"}
                </button>
              </>
            )
          ) : (
            <button
              onClick={handleBridgeAgain}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 text-sm transition-colors"
            >
              Bridge Again
            </button>
          )}
        </div>

        {/* Tx hash links — clickable to explorer */}
        {(state.approveTxHash ||
          state.burnTxHash ||
          state.mintTxHash ||
          relayState.approveTxHash ||
          relayState.depositTxHash ||
          relayState.fillTxHash ||
          acrossState.approveTxHash ||
          acrossState.depositTxHash ||
          acrossState.fillTxHash) && (
          <div className="text-xs space-y-1 pt-2 border-t border-zinc-800/50">
            {state.approveTxHash && (
              <TxLink hash={state.approveTxHash} chainId={sourceChain} label="Approve" />
            )}
            {state.burnTxHash && (
              <TxLink hash={state.burnTxHash} chainId={sourceChain} label="Burn" />
            )}
            {state.mintTxHash && (
              <TxLink hash={state.mintTxHash} chainId={destChain} label="Mint" />
            )}
            {relayState.approveTxHash && (
              <TxLink hash={relayState.approveTxHash} chainId={sourceChain} label="Approve" />
            )}
            {relayState.depositTxHash && (
              <TxLink
                hash={relayState.depositTxHash}
                chainId={sourceChain}
                label="Deposit"
              />
            )}
            {relayState.fillTxHash && (
              <TxLink hash={relayState.fillTxHash} chainId={destChain} label="Fill" />
            )}
            {acrossState.approveTxHash && (
              <TxLink hash={acrossState.approveTxHash} chainId={sourceChain} label="Approve" />
            )}
            {acrossState.depositTxHash && (
              <TxLink
                hash={acrossState.depositTxHash}
                chainId={sourceChain}
                label="Deposit"
              />
            )}
            {acrossState.fillTxHash && (
              <TxLink hash={acrossState.fillTxHash} chainId={destChain} label="Fill" />
            )}
          </div>
        )}

        <p className="text-xs text-zinc-600 text-center">
          {selectedProvider
            ? `Routing via ${PROVIDER_INFO[selectedProvider].name}`
            : "Phase 2 · Multi-aggregator routing"}
        </p>
      </div>

      {/* Floating tx tracker — shows during/after CCTP bridge flow */}
      <TxTracker
        state={state}
        sourceChain={sourceChain}
        destChain={destChain}
        onClose={() => reset()}
      />

      {/* Settings drawer — mounted here, opens from bridge form gear icon */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
