/**
 * LyxsaSplitter — Phase 4 Batch Bridge contract addresses + ABI.
 *
 * Deployed via CREATE2 deterministic deployer (salt: keccak256("LYXSA_SPLITTER_V1")).
 * Different addresses per chain because USDC contract address differs per testnet.
 *
 * Source: contracts/lyxsa-contracts/DEPLOYMENTS.md
 */

import type { Address, Hex } from "viem";

export const LYXSA_SPLITTER_ADDRESS: Record<number, Address> = {
  // Sepolia
  11155111: "0x8806AE628C9580Ec147B49D54a6731A2E815647C",
  // Base Sepolia
  84532: "0xC5C77a0f41326764ABCa14737e074e78099A8915",
  // Arbitrum Sepolia
  421614: "0x6c85f0F146FF195836C6E10f50b09D57F68ee300",
  // Arc Testnet
  5042002: "0x1E287e9BDD9BF20131F39DAca09c689C08C2365E",
};

/**
 * BurnLeg struct shape from LyxsaSplitter.sol.
 * One per destination, max 5 per batch.
 */
export type BurnLeg = {
  amount: bigint; // USDC raw (6 decimals)
  destinationDomain: number; // CCTP V2 domain
  mintRecipient: Hex; // bytes32 — address left-padded for EVM, raw 32-byte for Solana
  maxFee: bigint; // CCTP V2 fee (deducted from minted amount; 0 for max economy)
  minFinalityThreshold: number; // 1000 = Fast, 2000 = Confirmed
};

export const MAX_BATCH_DESTINATIONS = 5;

export const LYXSA_SPLITTER_ABI = [
  {
    type: "function",
    name: "batchBurn",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "legs",
        type: "tuple[]",
        components: [
          { name: "amount", type: "uint256" },
          { name: "destinationDomain", type: "uint32" },
          { name: "mintRecipient", type: "bytes32" },
          { name: "maxFee", type: "uint256" },
          { name: "minFinalityThreshold", type: "uint32" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenMessenger",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "BatchBurnInitiated",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "totalAmount", type: "uint256", indexed: false },
      { name: "destinationCount", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BurnRouted",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "destinationDomain", type: "uint32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "mintRecipient", type: "bytes32", indexed: false },
    ],
  },
  // Custom errors
  { type: "error", name: "EmptyBatch", inputs: [] },
  { type: "error", name: "TooManyDestinations", inputs: [{ type: "uint256" }] },
  { type: "error", name: "ZeroAmount", inputs: [{ type: "uint256" }] },
  { type: "error", name: "ZeroRecipient", inputs: [{ type: "uint256" }] },
  { type: "error", name: "InvalidFinalityThreshold", inputs: [{ type: "uint32" }] },
] as const;

/**
 * @returns true if the chain ID has a deployed LyxsaSplitter
 */
export function isBatchBridgeSupported(chainId: number): boolean {
  return chainId in LYXSA_SPLITTER_ADDRESS;
}

/**
 * @returns the LyxsaSplitter address for a chain, or undefined if not deployed.
 */
export function getSplitterAddress(chainId: number): Address | undefined {
  return LYXSA_SPLITTER_ADDRESS[chainId];
}

/**
 * Chains where Phase 4 Batch Bridge is currently available.
 * Used for UI source picker filtering.
 */
export const BATCH_BRIDGE_SOURCE_CHAINS = Object.keys(LYXSA_SPLITTER_ADDRESS).map(
  Number,
);
