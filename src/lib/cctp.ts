import {
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  avalancheFuji,
  optimismSepolia,
  polygonAmoy,
  unichainSepolia,
  lineaSepolia,
  codexTestnet,
  sonicBlazeTestnet,
  worldchainSepolia,
  monadTestnet,
  seiTestnet,
  xdcTestnet,
  hyperliquidEvmTestnet,
  inkSepolia,
  plumeSepolia,
  injectiveTestnet,
} from "wagmi/chains";
import {
  arcTestnet,
  pharosTestnet,
  morphHoodiTestnet,
  edgeTestnet,
  SOLANA_DEVNET_CHAIN_ID,
} from "./wagmi";

// CCTP V2 testnet contracts (uniform across all supported testnets)
// Source: https://developers.circle.com/cctp/v2-evm-smart-contracts
export const CCTP_V2_CONTRACTS = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`,
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as `0x${string}`,
  tokenMinter: "0xb43db544E2c27092c107639Ad201b3dEfAbcF192" as `0x${string}`,
} as const;

// CCTP V2 Domain IDs (used in cross-chain messaging encoding)
// Source: https://developers.circle.com/cctp/concepts/supported-chains-and-domains
// All 22 EVM testnets supported as of May 2026.
export const CCTP_DOMAINS: Record<number, number> = {
  [sepolia.id]: 0,
  [avalancheFuji.id]: 1,
  [optimismSepolia.id]: 2,
  [arbitrumSepolia.id]: 3,
  [baseSepolia.id]: 6,
  [polygonAmoy.id]: 7,
  [unichainSepolia.id]: 10,
  [lineaSepolia.id]: 11,
  [codexTestnet.id]: 12,
  [sonicBlazeTestnet.id]: 13,
  [worldchainSepolia.id]: 14,
  [monadTestnet.id]: 15,
  [seiTestnet.id]: 16,
  [xdcTestnet.id]: 18,
  [hyperliquidEvmTestnet.id]: 19,
  [inkSepolia.id]: 21,
  [plumeSepolia.id]: 22,
  [arcTestnet.id]: 26,
  [edgeTestnet.id]: 28,
  [injectiveTestnet.id]: 29,
  [morphHoodiTestnet.id]: 30,
  [pharosTestnet.id]: 31,
  // Non-EVM: Solana Devnet (synthetic chain ID for routing)
  [SOLANA_DEVNET_CHAIN_ID]: 5,
};

// Solana CCTP V2 program addresses (devnet & mainnet — same IDs)
// Source: https://developers.circle.com/cctp/solana-programs
// VERIFIED: TokenMessengerMinter is the v2vPZ one (does the mint), MessageTransmitter is v2Sm4 (entry point)
export const SOLANA_CCTP_PROGRAMS = {
  messageTransmitter: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
  tokenMessengerMinter: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
} as const;

// Solana Devnet USDC mint
export const SOLANA_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_DEVNET_CHAIN_ID;
}

// Chains that support CCTP V2 Fast Transfer (~8-30s)
// Other chains use Standard Transfer only (their native finality is faster
// than Fast attestation, so Circle disables Fast as a source).
// Source: https://developers.circle.com/cctp/required-block-confirmations
export const FAST_TRANSFER_CHAINS = new Set<number>([
  sepolia.id,
  baseSepolia.id,
  arbitrumSepolia.id,
  optimismSepolia.id,
  unichainSepolia.id,
  lineaSepolia.id,
  codexTestnet.id,
  worldchainSepolia.id,
  inkSepolia.id,
  plumeSepolia.id,
  edgeTestnet.id,
  morphHoodiTestnet.id,
]);

export function supportsFastTransfer(chainId: number): boolean {
  return FAST_TRANSFER_CHAINS.has(chainId);
}

export function chainIdToDomain(chainId: number): number {
  const domain = CCTP_DOMAINS[chainId];
  if (domain === undefined) {
    throw new Error(`No CCTP domain registered for chain ${chainId}`);
  }
  return domain;
}

// Pad EVM address (20 bytes) to bytes32 for cross-chain messaging
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  const cleaned = address.toLowerCase().replace(/^0x/, "");
  return `0x000000000000000000000000${cleaned}` as `0x${string}`;
}

// Encode Solana Pubkey (base58, 32 bytes) → bytes32 hex for EVM mintRecipient
// Used when bridging EVM → Solana: recipient is a Solana address.
export function solanaPubkeyToBytes32(base58Address: string): `0x${string}` {
  // Lazy-loaded to avoid heavy bundle in EVM-only flows
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };
  const bytes = bs58.decode(base58Address);
  if (bytes.length !== 32) {
    throw new Error(
      `Invalid Solana pubkey: expected 32 bytes, got ${bytes.length}`
    );
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

// Decode bytes32 hex → Solana Pubkey (base58)
// Used when bridging Solana → EVM: source/dest fields decoded.
export function bytes32ToSolanaPubkey(hex: `0x${string}`): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bs58 = require("bs58") as { encode: (b: Uint8Array) => string };
  const cleaned = hex.replace(/^0x/, "");
  if (cleaned.length !== 64) {
    throw new Error(
      `Invalid bytes32: expected 64 hex chars, got ${cleaned.length}`
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bs58.encode(bytes);
}

// Derive Associated Token Account (ATA) for Solana USDC recipient.
// CCTP mints USDC into the recipient's ATA, so mintRecipient = ATA address
// (NOT the wallet pubkey). The ATA may not exist yet; CCTP will create it.
// Async because @solana/spl-token loads PublicKey via Web3.js.
export async function deriveSolanaUsdcAta(walletPubkey: string): Promise<string> {
  const { PublicKey } = await import("@solana/web3.js");
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const owner = new PublicKey(walletPubkey);
  const mint = new PublicKey(SOLANA_USDC_MINT);
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  return ata.toBase58();
}

// CCTP V2 TokenMessenger ABI — depositForBurn function only
export const TOKEN_MESSENGER_V2_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    name: "depositForBurn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// CCTP V2 MessageTransmitter ABI — receiveMessage function only
export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    name: "receiveMessage",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Bridge constants
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

// CCTP V2 finality thresholds
// Standard: free, ~13-19 minutes (waits for chain finality)
// Fast: small fee (~0.5 USDC), ~30 seconds
export const FINALITY_STANDARD = 2000;
export const FINALITY_FAST = 1000;
