/**
 * CCTP V2 Solana receiveMessage instruction builder.
 *
 * Called after the EVM-side burn is attested by Circle's iris API. Mints
 * USDC into the recipient's Associated Token Account (ATA) on Solana.
 *
 * Reference: circlefin/solana-cctp-contracts/examples/v2/solana.ts
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { BorshCoder, Idl } from "@coral-xyz/anchor";

import { SOLANA_CCTP_PROGRAMS, SOLANA_USDC_MINT } from "../cctp";
import messageTransmitterIdl from "./idl/message_transmitter_v2.json";

/**
 * Anchor sighash for `global:receive_message`.
 * Computed from sha256("global:receive_message")[0..8].
 * Verified against Circle's solana-cctp-contracts IDL.
 */
const RECEIVE_MESSAGE_DISCRIMINATOR = Buffer.from([
  38, 144, 127, 225, 31, 225, 238, 25,
]);

/**
 * Decode the nonce (32 bytes) from a CCTP V2 message hex string.
 * Layout: bytes [12..44] of the message contain the unique nonce.
 */
export function decodeMessageNonce(messageHex: string): Buffer {
  const cleaned = messageHex.replace(/^0x/, "");
  return Buffer.from(cleaned, "hex").subarray(12, 44);
}

/**
 * Decode the source domain (4 bytes, big-endian uint32) from a CCTP V2 message.
 * Layout: bytes [4..8] = sourceDomain.
 */
export function decodeSourceDomain(messageHex: string): number {
  const cleaned = messageHex.replace(/^0x/, "");
  const buf = Buffer.from(cleaned, "hex");
  return buf.readUInt32BE(4);
}

/**
 * Decode the burn token address (32 bytes) from a CCTP V2 burn message.
 * Layout: bytes [148..180] of the message body contain burnToken.
 * (Header is 148 bytes, then BurnMessage starts.)
 */
export function decodeBurnToken(messageHex: string): Buffer {
  const cleaned = messageHex.replace(/^0x/, "");
  return Buffer.from(cleaned, "hex").subarray(148, 180);
}

/**
 * All PDAs needed to invoke MessageTransmitter.receive_message.
 */
export interface ReceiveMessagePdas {
  // Fixed accounts (top-level instruction)
  authorityPda: PublicKey;
  messageTransmitter: PublicKey;
  usedNonce: PublicKey;
  eventAuthorityMt: PublicKey;
  // remainingAccounts (forwarded to TokenMessengerMinter CPI)
  tokenMessenger: PublicKey;
  remoteTokenMessenger: PublicKey;
  tokenMinter: PublicKey;
  localToken: PublicKey;
  tokenPair: PublicKey;
  custodyTokenAccount: PublicKey;
  eventAuthorityTmm: PublicKey;
}

/**
 * Derive all CCTP V2 Solana PDAs needed for receive_message.
 *
 * @param messageHex hex string of the CCTP message (with or without 0x prefix)
 */
export function deriveReceiveMessagePdas(messageHex: string): ReceiveMessagePdas {
  const messageTransmitterId = new PublicKey(SOLANA_CCTP_PROGRAMS.messageTransmitter);
  const tokenMessengerMinterId = new PublicKey(
    SOLANA_CCTP_PROGRAMS.tokenMessengerMinter
  );
  const usdcMint = new PublicKey(SOLANA_USDC_MINT);

  const sourceDomain = decodeSourceDomain(messageHex);
  const sourceDomainSeed = Buffer.from(sourceDomain.toString());
  const nonceBytes = decodeMessageNonce(messageHex);
  const burnToken = decodeBurnToken(messageHex);

  // MessageTransmitter PDAs
  const [authorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter_authority"), tokenMessengerMinterId.toBuffer()],
    messageTransmitterId
  );
  const [messageTransmitter] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter")],
    messageTransmitterId
  );
  const [usedNonce] = PublicKey.findProgramAddressSync(
    [Buffer.from("used_nonce"), nonceBytes],
    messageTransmitterId
  );
  const [eventAuthorityMt] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    messageTransmitterId
  );

  // TokenMessengerMinter PDAs
  const [tokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")],
    tokenMessengerMinterId
  );
  const [remoteTokenMessenger] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_token_messenger"), sourceDomainSeed],
    tokenMessengerMinterId
  );
  const [tokenMinter] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")],
    tokenMessengerMinterId
  );
  const [localToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("local_token"), usdcMint.toBuffer()],
    tokenMessengerMinterId
  );
  const [tokenPair] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_pair"), sourceDomainSeed, burnToken],
    tokenMessengerMinterId
  );
  const [custodyTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("custody_token_account"), usdcMint.toBuffer()],
    tokenMessengerMinterId
  );
  const [eventAuthorityTmm] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    tokenMessengerMinterId
  );

  return {
    authorityPda,
    messageTransmitter,
    usedNonce,
    eventAuthorityMt,
    tokenMessenger,
    remoteTokenMessenger,
    tokenMinter,
    localToken,
    tokenPair,
    custodyTokenAccount,
    eventAuthorityTmm,
  };
}

/**
 * Fetch the fee recipient pubkey from the on-chain TokenMessenger account.
 * Required for the fee_recipient_token_account in the CPI.
 */
async function fetchFeeRecipient(
  connection: Connection,
  tokenMessengerPda: PublicKey
): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(tokenMessengerPda);
  if (!accountInfo) {
    throw new Error("TokenMessenger account not found on-chain");
  }
  // TokenMessenger struct layout (Anchor):
  // 8 bytes discriminator + owner (32) + pending_owner (33) + ...
  // fee_recipient is at offset 8 + 32 + 33 = 73 (but pending_owner is Option<Pubkey> = 1 + 32)
  // Safer: use BorshCoder with TokenMessenger IDL. For now, use Circle's known offset.
  // From IDL: discriminator + owner + pending_owner(option) + local_message_transmitter +
  //           message_body_version + authority_bump + fee_recipient
  // = 8 + 32 + 33 + 32 + 4 + 1 + 32 = fee_recipient at offset 110
  const FEE_RECIPIENT_OFFSET = 110;
  const feeRecipientBytes = accountInfo.data.subarray(
    FEE_RECIPIENT_OFFSET,
    FEE_RECIPIENT_OFFSET + 32
  );
  return new PublicKey(feeRecipientBytes);
}

/**
 * Build the instruction data buffer for receive_message.
 * Layout: discriminator (8) + Borsh-encoded { message: Vec<u8>, attestation: Vec<u8> }
 */
function encodeReceiveMessageData(
  messageHex: string,
  attestationHex: string
): Buffer {
  const coder = new BorshCoder(messageTransmitterIdl as Idl);
  const args = {
    params: {
      message: Buffer.from(messageHex.replace(/^0x/, ""), "hex"),
      attestation: Buffer.from(attestationHex.replace(/^0x/, ""), "hex"),
    },
  };
  // Anchor instruction encoding: discriminator + borsh args
  const argsBuf = coder.instruction.encode("receiveMessage", args);
  return argsBuf;
}

/**
 * Build a complete Solana transaction to receive a CCTP V2 message and mint USDC.
 *
 * @param connection Solana RPC connection (devnet or mainnet)
 * @param payer the wallet that signs and pays for the transaction
 * @param recipient the wallet that will receive USDC (used to derive ATA)
 * @param messageHex CCTP message bytes (hex with or without 0x prefix)
 * @param attestationHex Circle's attestation bytes (hex with or without 0x prefix)
 * @returns unsigned Transaction ready to be signed by the wallet
 */
export async function buildReceiveMessageTransaction(params: {
  connection: Connection;
  payer: PublicKey;
  recipient: PublicKey;
  messageHex: string;
  attestationHex: string;
}): Promise<Transaction> {
  const { connection, payer, recipient, messageHex, attestationHex } = params;

  const messageTransmitterId = new PublicKey(SOLANA_CCTP_PROGRAMS.messageTransmitter);
  const tokenMessengerMinterId = new PublicKey(
    SOLANA_CCTP_PROGRAMS.tokenMessengerMinter
  );
  const usdcMint = new PublicKey(SOLANA_USDC_MINT);

  const pdas = deriveReceiveMessagePdas(messageHex);

  // Recipient USDC ATA — must exist before receiveMessage is called
  const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipient, true);

  // Fee recipient ATA — fetched from on-chain TokenMessenger.fee_recipient
  const feeRecipientPubkey = await fetchFeeRecipient(connection, pdas.tokenMessenger);
  const feeRecipientAta = getAssociatedTokenAddressSync(
    usdcMint,
    feeRecipientPubkey,
    true
  );

  // Idempotent ATA creation — safe if already exists
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    payer,
    recipientAta,
    recipient,
    usdcMint
  );

  // Bump compute unit limit (default 200k is not enough for receiveMessage + CPI)
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000,
  });

  // Fixed accounts (9 total)
  const fixedAccounts = [
    { pubkey: payer, isSigner: true, isWritable: true }, // payer
    { pubkey: payer, isSigner: true, isWritable: false }, // caller
    { pubkey: pdas.authorityPda, isSigner: false, isWritable: false },
    { pubkey: pdas.messageTransmitter, isSigner: false, isWritable: false },
    { pubkey: pdas.usedNonce, isSigner: false, isWritable: true },
    { pubkey: tokenMessengerMinterId, isSigner: false, isWritable: false }, // receiver
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: pdas.eventAuthorityMt, isSigner: false, isWritable: false },
    { pubkey: messageTransmitterId, isSigner: false, isWritable: false }, // self-ref for event_cpi
  ];

  // remainingAccounts — forwarded to TokenMessengerMinter CPI (11 total)
  const remainingAccounts = [
    { pubkey: pdas.tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: pdas.remoteTokenMessenger, isSigner: false, isWritable: false },
    { pubkey: pdas.tokenMinter, isSigner: false, isWritable: true },
    { pubkey: pdas.localToken, isSigner: false, isWritable: true },
    { pubkey: pdas.tokenPair, isSigner: false, isWritable: false },
    { pubkey: feeRecipientAta, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: pdas.custodyTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pdas.eventAuthorityTmm, isSigner: false, isWritable: false },
    { pubkey: tokenMessengerMinterId, isSigner: false, isWritable: false },
  ];

  const data = encodeReceiveMessageData(messageHex, attestationHex);

  const receiveMessageIx = new TransactionInstruction({
    programId: messageTransmitterId,
    keys: [...fixedAccounts, ...remainingAccounts],
    data,
  });

  const tx = new Transaction();
  tx.add(computeBudgetIx);
  tx.add(ataIx);
  tx.add(receiveMessageIx);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  return tx;
}

/**
 * Re-export ATA derivation for convenience.
 * Used at the EVM-side burn step: mintRecipient must be the recipient's ATA,
 * NOT their wallet pubkey.
 */
export function getRecipientUsdcAta(walletPubkey: string | PublicKey): string {
  const owner = typeof walletPubkey === "string" ? new PublicKey(walletPubkey) : walletPubkey;
  const mint = new PublicKey(SOLANA_USDC_MINT);
  return getAssociatedTokenAddressSync(mint, owner, true).toBase58();
}

// Re-export for convenience
export { ASSOCIATED_TOKEN_PROGRAM_ID };
