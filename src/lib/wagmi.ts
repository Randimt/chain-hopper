"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import {
  sepolia,
  baseSepolia,
  arbitrumSepolia,
} from "wagmi/chains";

// Custom chain: Arc Network Testnet (by Circle)
// USDC is BOTH the native gas token AND an ERC20 contract (precompile 0x36...0000)
// CCTP V2 fully supported: Domain 26, contracts identical to other testnets.
// Source: https://chainid.network/chain/5042002
//         https://developers.circle.com/cctp/concepts/supported-chains-and-domains
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Network Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

// WalletConnect Project ID — set via env var NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo";

// Plix supported chains — TESTNET ONLY (Phase 1)
// All chains support CCTP V2 + ERC20 USDC standard.
export const config = getDefaultConfig({
  appName: "Plix",
  projectId,
  chains: [
    sepolia,
    baseSepolia,
    arbitrumSepolia,
    arcTestnet,
  ],
  ssr: true,
});

// USDC contract addresses per testnet chain (ERC20, 6 decimals)
// Source: https://developers.circle.com/stablecoins/usdc-contract-addresses
// Arc USDC: precompile contract that's both native gas + ERC20-compatible.
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [arbitrumSepolia.id]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [arcTestnet.id]: "0x3600000000000000000000000000000000000000",
};

// Chain metadata for UI
export const CHAIN_INFO: Record<number, { name: string; logo: string; color: string; explorer: string }> = {
  [sepolia.id]: { name: "Sepolia", logo: "🔷", color: "#627EEA", explorer: "https://sepolia.etherscan.io" },
  [baseSepolia.id]: { name: "Base Sepolia", logo: "🔵", color: "#0052FF", explorer: "https://sepolia.basescan.org" },
  [arbitrumSepolia.id]: { name: "Arbitrum Sepolia", logo: "🟣", color: "#28A0F0", explorer: "https://sepolia.arbiscan.io" },
  [arcTestnet.id]: { name: "Arc Testnet", logo: "⭕", color: "#00D4FF", explorer: "https://testnet.arcscan.app" },
};
