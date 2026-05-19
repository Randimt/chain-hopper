"use client";

/**
 * Hook for executing CCTP V2 Solana receiveMessage via Phantom wallet.
 *
 * Flow:
 *   1. EVM side already burned USDC and we have message + attestation from Circle iris API
 *   2. This hook builds the Solana receive tx, signs via Phantom, and confirms it
 *   3. USDC is minted into the recipient's USDC ATA
 */

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { buildReceiveMessageTransaction } from "@/lib/cctp/solana-receive";

export type SolanaReceiveStatus =
  | "idle"
  | "building"
  | "awaiting-signature"
  | "confirming"
  | "complete"
  | "error";

export interface SolanaReceiveState {
  status: SolanaReceiveStatus;
  txSignature?: string;
  error?: string;
}

export interface UseSolanaReceiveResult extends SolanaReceiveState {
  receive: (params: {
    messageHex: string;
    attestationHex: string;
    recipient?: string;
  }) => Promise<string | undefined>;
  reset: () => void;
}

export function useSolanaReceive(): UseSolanaReceiveResult {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [state, setState] = useState<SolanaReceiveState>({ status: "idle" });

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  const receive = useCallback(
    async (params: {
      messageHex: string;
      attestationHex: string;
      recipient?: string;
    }): Promise<string | undefined> => {
      if (!connected || !publicKey) {
        const err = "Connect Phantom wallet first";
        setState({ status: "error", error: err });
        return;
      }

      try {
        setState({ status: "building" });

        const recipientPubkey = params.recipient
          ? new PublicKey(params.recipient)
          : publicKey;

        const tx = await buildReceiveMessageTransaction({
          connection,
          payer: publicKey,
          recipient: recipientPubkey,
          messageHex: params.messageHex,
          attestationHex: params.attestationHex,
        });

        setState({ status: "awaiting-signature" });

        const signature = await sendTransaction(tx, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        setState({ status: "confirming", txSignature: signature });

        // Wait for confirmation (Solana devnet typically ~30s)
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

        setState({ status: "complete", txSignature: signature });
        return signature;
      } catch (e) {
        const errMsg = humanizeError(e);
        console.error("[useSolanaReceive] error:", e);
        setState({ status: "error", error: errMsg });
        return undefined;
      }
    },
    [connected, publicKey, connection, sendTransaction]
  );

  return { ...state, receive, reset };
}

/**
 * Convert Solana program errors into friendlier messages.
 */
function humanizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/User rejected/i.test(msg) || /WalletSignTransactionError/i.test(msg)) {
    return "Transaction signing cancelled in Phantom";
  }
  if (/insufficient.*lamports/i.test(msg) || /Insufficient funds/i.test(msg)) {
    return "Not enough SOL to pay for transaction (need ~0.005 SOL devnet)";
  }
  if (/already in use/i.test(msg) || /AccountAlreadyInitialized/i.test(msg)) {
    return "This message was already received. Check your USDC balance.";
  }
  if (/InvalidMintRecipient/i.test(msg)) {
    return "Recipient mismatch — EVM burn used wrong Solana address";
  }
  if (/0x[0-9a-f]+/.test(msg)) {
    // Solana program errors often include hex codes
    return `Solana program error: ${msg.slice(0, 200)}`;
  }
  return msg.slice(0, 200);
}
