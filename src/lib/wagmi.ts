"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import {
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
  avalancheFuji,
} from "wagmi/chains";

// Custom chain: Arc Network Testnet (by Circle)
// Native gas token = USDC. No ERC20 contract needed for USDC balance.
// Source: https://chainid.network/chain/5042002
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Network Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
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

// Chain Hopper supported chains — TESTNET ONLY (Phase 1)
export const config = getDefaultConfig({
  appName: "Chain Hopper",
  projectId,
  chains: [
    sepolia,
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    polygonAmoy,
    avalancheFuji,
    arcTestnet,
  ],
  ssr: true,
});

// USDC contract addresses per testnet chain (ERC20)
// Source: https://developers.circle.com/stablecoins/usdc-on-test-networks
// Arc Testnet excluded — USDC is the NATIVE currency, not ERC20
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [arbitrumSepolia.id]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [optimismSepolia.id]: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  [polygonAmoy.id]: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  [avalancheFuji.id]: "0x5425890298aed601595a70AB815c96711a31Bc65",
};

// Arc Testnet uses NATIVE USDC (gas token). Tracked separately via useBalance.
export const ARC_TESTNET_CHAIN_ID = arcTestnet.id;

// Chain metadata for UI
export const CHAIN_INFO: Record<number, { name: string; logo: string; color: string }> = {
  [sepolia.id]: { name: "Sepolia", logo: "🔷", color: "#627EEA" },
  [baseSepolia.id]: { name: "Base Sepolia", logo: "🔵", color: "#0052FF" },
  [arbitrumSepolia.id]: { name: "Arbitrum Sepolia", logo: "🟣", color: "#28A0F0" },
  [optimismSepolia.id]: { name: "Optimism Sepolia", logo: "🔴", color: "#FF0420" },
  [polygonAmoy.id]: { name: "Polygon Amoy", logo: "🟪", color: "#8247E5" },
  [avalancheFuji.id]: { name: "Avalanche Fuji", logo: "🔺", color: "#E84142" },
  [arcTestnet.id]: { name: "Arc Testnet", logo: "⭕", color: "#00D4FF" },
};
