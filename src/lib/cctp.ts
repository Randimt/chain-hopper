import {
  sepolia,
  baseSepolia,
  arbitrumSepolia,
} from "wagmi/chains";
import { arcTestnet } from "./wagmi";

// CCTP V2 testnet contracts (uniform across all supported testnets)
// Source: https://developers.circle.com/cctp/v2-evm-smart-contracts
export const CCTP_V2_CONTRACTS = {
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`,
  messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as `0x${string}`,
  tokenMinter: "0xb43db544E2c27092c107639Ad201b3dEfAbcF192" as `0x${string}`,
} as const;

// CCTP Domain IDs (used in cross-chain messaging encoding)
// Source: https://developers.circle.com/cctp/concepts/supported-chains-and-domains
// Active chains: Sepolia, Base Sepolia, Arbitrum Sepolia, Arc Testnet
export const CCTP_DOMAINS: Record<number, number> = {
  [sepolia.id]: 0,
  [arbitrumSepolia.id]: 3,
  [baseSepolia.id]: 6,
  [arcTestnet.id]: 26,
};

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
