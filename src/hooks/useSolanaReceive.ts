"use client";

/**
 * Hook for executing CCTP V2 Solana receiveMessage via Solana wallet.
 *
 * Flow:
 *   1. EVM side already burned USDC and we have message + attestation from Circle iris API
 *   2. prepare(): builds the Solana tx(s) in BACKGROUND (called from useEffect, no user gesture)
 *      - If recipient ATA doesn't exist, builds 2 txs: setupTx (ATA creation) + receiveTx
 *      - If recipient ATA exists, builds 1 tx: receiveTx only
 *   3. signAndSend(): signs via wallet, fired from USER CLICK (preserves gesture)
 *      - Sends setupTx first if present, waits confirm, then sends receiveTx
 *   4. USDC is minted into the recipient's USDC ATA
 *
 * Why split prepare/signAndSend:
 *   Browser/wallet adapters (especially Backpack) require fresh user gesture to
 *   open signing popup. Any async work between click and sendTransaction loses
 *   the gesture token. By pre-building the tx during attestation phase, the
 *   click handler can call sendTransaction() with zero async work first.
 *
 * Why split into setupTx + receiveTx:
 *   Combined tx (computeBudget + ATA creation + receiveMessage) exceeds
 *   Solana's 1232-byte transaction size limit when ATA needs to be created.
 *   Splitting into 2 txs keeps each well under the limit. User signs 2x.
 */

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";

import { buildReceiveMessageTransaction } from "@/lib/cctp/solana-receive";

/**
 * Sign + manually submit a Solana tx via raw RPC.
 *
 * Why not sendTransaction (the adapter helper):
 *   Some wallets (Solflare, sometimes Phantom) run a strict local preflight
 *   simulation and surface only "Internal error" on failure, hiding logs.
 *   By using signTransaction + sendRawTransaction with skipPreflight=true,
 *   we bypass the wallet's preflight entirely. We pre-simulate ourselves
 *   beforehand so users get the REAL error if the tx is bad.
 */
async function signAndSubmit(params: {
  tx: Transaction;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  connection: import("@solana/web3.js").Connection;
}): Promise<string> {
  const { tx, signTransaction, connection } = params;

  // Pre-simulate to surface real errors BEFORE asking user to sign
  // (cheap RPC call, gives us program logs without consuming gas)
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const errStr = JSON.stringify(sim.value.err);
    const e = new Error(`Pre-simulation failed: ${errStr}`) as Error & {
      logs?: string[];
    };
    e.logs = logs;
    throw e;
  }

  const signed = await signTransaction(tx);
  const rawTx = signed.serialize();

  // skipPreflight=true: we already simulated; avoid double-sim that some
  // RPC nodes mis-handle. maxRetries handles transient blockhash issues.
  const sig = await connection.sendRawTransaction(rawTx, {
    skipPreflight: true,
    maxRetries: 3,
  });

  return sig;
}

export type SolanaReceiveStatus =
  | "idle"
  | "building"
  | "ready"
  | "awaiting-signature"
  | "creating-ata"
  | "confirming-ata"
  | "confirming"
  | "complete"
  | "error";

export interface SolanaReceiveState {
  status: SolanaReceiveStatus;
  txSignature?: string;
  error?: string;
  /** True if setupTx (ATA creation) is required = 2 signatures total. */
  needsAtaCreation?: boolean;
}

export interface UseSolanaReceiveResult extends SolanaReceiveState {
  /** Build tx in background. Safe to call from useEffect. */
  prepare: (params: {
    messageHex: string;
    attestationHex: string;
    recipient?: string;
  }) => Promise<void>;
  /** Sign + send the prepared tx. MUST be called from user click handler. */
  signAndSend: () => Promise<string | undefined>;
  reset: () => void;
}

export function useSolanaReceive(): UseSolanaReceiveResult {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [state, setState] = useState<SolanaReceiveState>({ status: "idle" });
  const setupTxRef = useRef<Transaction | null>(null);
  const receiveTxRef = useRef<Transaction | null>(null);
  const preparingKeyRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setupTxRef.current = null;
    receiveTxRef.current = null;
    preparingKeyRef.current = null;
    setState({ status: "idle" });
  }, []);

  const prepare = useCallback(
    async (params: {
      messageHex: string;
      attestationHex: string;
      recipient?: string;
    }): Promise<void> => {
      if (!connected || !publicKey) {
        console.warn("[useSolanaReceive] prepare: wallet not connected");
        return;
      }

      // Idempotency: skip if already preparing/prepared the same message
      const key = `${params.messageHex}:${params.attestationHex}:${params.recipient ?? ""}`;
      if (preparingKeyRef.current === key) {
        console.log("[useSolanaReceive] prepare: already prepared this message");
        return;
      }
      preparingKeyRef.current = key;

      try {
        setState({ status: "building" });
        console.log("[useSolanaReceive] building tx...");

        const recipientPubkey = params.recipient
          ? new PublicKey(params.recipient)
          : publicKey;

        const { setupTx, receiveTx } = await buildReceiveMessageTransaction({
          connection,
          payer: publicKey,
          recipient: recipientPubkey,
          messageHex: params.messageHex,
          attestationHex: params.attestationHex,
        });

        setupTxRef.current = setupTx;
        receiveTxRef.current = receiveTx;
        const needsAta = setupTx !== null;
        setState({ status: "ready", needsAtaCreation: needsAta });
        console.log(
          `[useSolanaReceive] tx prepared, ${needsAta ? "needs ATA + receive (2 sigs)" : "receive only (1 sig)"}`
        );
      } catch (e) {
        const errMsg = humanizeError(e);
        console.error("[useSolanaReceive] prepare error:", e);
        preparingKeyRef.current = null;
        setState({ status: "error", error: errMsg });
      }
    },
    [connected, publicKey, connection]
  );

  const signAndSend = useCallback(async (): Promise<string | undefined> => {
    if (!connected || !publicKey) {
      const err = "Connect Solana wallet first";
      setState({ status: "error", error: err });
      return;
    }

    if (!signTransaction) {
      const err = "Wallet doesn't support signTransaction";
      setState({ status: "error", error: err });
      return;
    }

    const setupTx = setupTxRef.current;
    const receiveTx = receiveTxRef.current;
    if (!receiveTx) {
      const err = "Transaction not prepared yet — please wait";
      console.error("[useSolanaReceive] signAndSend: no prepared tx");
      setState({ status: "error", error: err });
      return;
    }

    try {
      // PHASE 1: ATA creation (if needed)
      if (setupTx) {
        setState({ status: "creating-ata", needsAtaCreation: true });
        console.log("[useSolanaReceive] sending ATA creation tx (1/2)...");

        const setupSig = await signAndSubmit({
          tx: setupTx,
          signTransaction,
          connection,
        });
        console.log("[useSolanaReceive] ATA tx submitted:", setupSig);

        setState({ status: "confirming-ata", needsAtaCreation: true });
        const setupBlockhash = await connection.getLatestBlockhash("confirmed");
        const setupResult = await connection.confirmTransaction(
          {
            signature: setupSig,
            blockhash: setupBlockhash.blockhash,
            lastValidBlockHeight: setupBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );
        if (setupResult.value.err) {
          throw new Error(
            `ATA creation failed: ${JSON.stringify(setupResult.value.err)}`
          );
        }
        console.log("[useSolanaReceive] ATA created");

        // Refresh blockhash for receiveTx since ATA confirm took time
        const freshBlockhash = await connection.getLatestBlockhash("confirmed");
        receiveTx.recentBlockhash = freshBlockhash.blockhash;
      }

      // PHASE 2: receiveMessage (always required)
      setState({
        status: "awaiting-signature",
        needsAtaCreation: setupTx !== null,
      });
      console.log(
        `[useSolanaReceive] sending receiveMessage tx${setupTx ? " (2/2)" : ""}...`
      );

      const signature = await signAndSubmit({
        tx: receiveTx,
        signTransaction,
        connection,
      });

      console.log("[useSolanaReceive] receive tx submitted:", signature);
      setState({
        status: "confirming",
        txSignature: signature,
        needsAtaCreation: setupTx !== null,
      });

      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      if (result.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(result.value.err)}`
        );
      }

      console.log("[useSolanaReceive] confirmed");
      setState({ status: "complete", txSignature: signature });
      return signature;
    } catch (e) {
      // Solana SendTransactionError attaches simulation logs as e.logs
      const errAny = e as { logs?: string[]; message?: string };
      if (errAny.logs && errAny.logs.length > 0) {
        console.error("[useSolanaReceive] tx logs:", errAny.logs);
      }
      const errMsg = humanizeError(e, errAny.logs);
      console.error("[useSolanaReceive] signAndSend error:", e);
      setState({ status: "error", error: errMsg });
      return undefined;
    }
  }, [connected, publicKey, connection, signTransaction]);

  return { ...state, prepare, signAndSend, reset };
}

/**
 * Convert Solana program errors into friendlier messages.
 */
function humanizeError(e: unknown, logs?: string[]): string {
  const msg = e instanceof Error ? e.message : String(e);

  // Extract program error from logs if available
  if (logs && logs.length > 0) {
    const errLog = logs.find((l) => /Error|failed|insufficient|exceeded/i.test(l));
    if (errLog) {
      // Surface the real program error message + first few logs for context
      const lastLogs = logs.slice(-5).join(" | ");
      return `${errLog.slice(0, 100)} (logs: ${lastLogs.slice(0, 300)})`;
    }
  }

  if (/User rejected/i.test(msg) || /WalletSignTransactionError/i.test(msg)) {
    return "Transaction signing cancelled in wallet";
  }
  if (/insufficient.*lamports/i.test(msg) || /Insufficient funds/i.test(msg)) {
    return "Not enough SOL to pay for transaction (need ~0.005 SOL devnet)";
  }
  if (/Transaction too large/i.test(msg)) {
    return "Transaction too large — please report this bug";
  }
  if (/already in use/i.test(msg) || /AccountAlreadyInitialized/i.test(msg)) {
    return "This message was already received. Check your USDC balance.";
  }
  if (/InvalidMintRecipient/i.test(msg)) {
    return "Recipient mismatch — EVM burn used wrong Solana address";
  }
  if (/0x[0-9a-f]+/.test(msg)) {
    return `Solana program error: ${msg.slice(0, 200)}`;
  }
  return msg.slice(0, 200);
}
