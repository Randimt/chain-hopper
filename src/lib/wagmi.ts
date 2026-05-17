"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, base, arbitrum, optimism, polygon, avalanche } from "wagmi/chains";

// Chain Hopper supported chains (Phase 1 - EVM only)
export const config = getDefaultConfig({
  appName: "Chain Hopper",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID", // ganti nanti
  chains: [mainnet, base, arbitrum, optimism, polygon, avalanche],
  ssr: true, // Next.js App Router needs this
});

// USDC contract addresses per chain (mainnet)
// Source: Circle skill use-usdc + https://developers.circle.com/stablecoins/usdc-contract-addresses
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [avalanche.id]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
};

// Chain metadata for UI
export const CHAIN_INFO: Record<number, { name: string; logo: string; color: string }> = {
  [mainnet.id]: { name: "Ethereum", logo: "🔷", color: "#627EEA" },
  [base.id]: { name: "Base", logo: "🔵", color: "#0052FF" },
  [arbitrum.id]: { name: "Arbitrum", logo: "🟣", color: "#28A0F0" },
  [optimism.id]: { name: "Optimism", logo: "🔴", color: "#FF0420" },
  [polygon.id]: { name: "Polygon", logo: "🟪", color: "#8247E5" },
  [avalanche.id]: { name: "Avalanche", logo: "🔺", color: "#E84142" },
};
