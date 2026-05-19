"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
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

// =============================================================================
// CUSTOM CHAINS (not in viem built-in chain registry)
// =============================================================================

// Arc Network Testnet (Circle) — USDC is BOTH native gas + ERC20 precompile
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Network Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

// Pharos Testnet — CCTP V2 Domain 31
export const pharosTestnet = defineChain({
  id: 688688,
  name: "Pharos Testnet",
  nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.dplabs-internal.com"] } },
  blockExplorers: {
    default: { name: "Pharosscan", url: "https://testnet.pharosscan.xyz" },
  },
  testnet: true,
});

// Morph Hoodi Testnet — CCTP V2 Domain 30 (chain 2910, distinct from morphHolesky 2810)
export const morphHoodiTestnet = defineChain({
  id: 2910,
  name: "Morph Hoodi Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-hoodi.morphl2.io"] } },
  blockExplorers: {
    default: { name: "Morph Hoodi Explorer", url: "https://explorer-hoodi.morph.network" },
  },
  testnet: true,
});

// EDGE Testnet — CCTP V2 Domain 28
export const edgeTestnet = defineChain({
  id: 33431,
  name: "EDGE Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://edge-testnet.g.alchemy.com/public"] } },
  blockExplorers: {
    default: { name: "EDGE Explorer", url: "https://edge-testnet.explorer.alchemy.com" },
  },
  testnet: true,
});

// =============================================================================
// WAGMI CONFIG
// =============================================================================

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo";

// Plix supported chains — ALL CCTP V2 testnets (22 total)
// All chains support CCTP V2 burn-and-mint via TokenMessenger.
export const config = getDefaultConfig({
  appName: "Plix",
  projectId,
  chains: [
    // Tier 1: Most popular / battle-tested
    sepolia,
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    polygonAmoy,
    avalancheFuji,
    // Tier 2: Active testnets with good ecosystem
    unichainSepolia,
    lineaSepolia,
    monadTestnet,
    plumeSepolia,
    inkSepolia,
    worldchainSepolia,
    sonicBlazeTestnet,
    seiTestnet,
    // Tier 3: Specialized / newer chains
    pharosTestnet,
    arcTestnet,
    codexTestnet,
    hyperliquidEvmTestnet,
    injectiveTestnet,
    xdcTestnet,
    morphHoodiTestnet,
    edgeTestnet,
  ],
  ssr: true,
});

// =============================================================================
// USDC CONTRACT ADDRESSES (per chain)
// Source: https://developers.circle.com/stablecoins/usdc-contract-addresses
// =============================================================================

export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [arbitrumSepolia.id]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [optimismSepolia.id]: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  [polygonAmoy.id]: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  [avalancheFuji.id]: "0x5425890298aed601595a70AB815c96711a31Bc65",
  [unichainSepolia.id]: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  [lineaSepolia.id]: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7",
  [monadTestnet.id]: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  [plumeSepolia.id]: "0xcB5f30e335672893c7eb944B374c196392C19D18",
  [inkSepolia.id]: "0xFabab97dCE620294D2B0b0e46C68964e326300Ac",
  [worldchainSepolia.id]: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
  [sonicBlazeTestnet.id]: "0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6",
  [seiTestnet.id]: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
  [pharosTestnet.id]: "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B",
  [arcTestnet.id]: "0x3600000000000000000000000000000000000000",
  [codexTestnet.id]: "0x6d7f141b6819C2c9CC2f818e6ad549E7Ca090F8f",
  [hyperliquidEvmTestnet.id]: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
  [injectiveTestnet.id]: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
  [xdcTestnet.id]: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4",
  [morphHoodiTestnet.id]: "0x7433b41C6c5e1d58D4Da99483609520255ab661B",
  [edgeTestnet.id]: "0x2d9F7CAD728051AA35Ecdc472a14cf8cDF5CFD6B",
};

// =============================================================================
// CHAIN UI METADATA (logo emoji, brand color, explorer URL)
// =============================================================================

// =============================================================================
// CHAIN MAP — centralized id → viem Chain object lookup
// Used by useBridge, useRelayBridge, useAcrossBridge for tx routing
// =============================================================================

import type { Chain } from "viem";

export const CHAIN_MAP: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [optimismSepolia.id]: optimismSepolia,
  [polygonAmoy.id]: polygonAmoy,
  [avalancheFuji.id]: avalancheFuji,
  [unichainSepolia.id]: unichainSepolia,
  [lineaSepolia.id]: lineaSepolia,
  [monadTestnet.id]: monadTestnet,
  [plumeSepolia.id]: plumeSepolia,
  [inkSepolia.id]: inkSepolia,
  [worldchainSepolia.id]: worldchainSepolia,
  [sonicBlazeTestnet.id]: sonicBlazeTestnet,
  [seiTestnet.id]: seiTestnet,
  [pharosTestnet.id]: pharosTestnet,
  [arcTestnet.id]: arcTestnet,
  [codexTestnet.id]: codexTestnet,
  [hyperliquidEvmTestnet.id]: hyperliquidEvmTestnet,
  [injectiveTestnet.id]: injectiveTestnet,
  [xdcTestnet.id]: xdcTestnet,
  [morphHoodiTestnet.id]: morphHoodiTestnet,
  [edgeTestnet.id]: edgeTestnet,
};

export type ChainType = "L1" | "L2" | "EVM" | "Cosmos+EVM" | "Solana";

/**
 * Synthetic chain ID for Solana Devnet (Solana doesn't use EVM-style chainIds).
 * Used for UI display only — not registered in wagmi/USDC_ADDRESSES because
 * Solana requires non-EVM RPC + wallet adapter (Phantom). Bridge UI shows it
 * as "Coming Soon" until full Solana CCTP V2 integration is implemented.
 *
 * CCTP V2 Solana domain: 5 (mainnet & devnet share same domain).
 * USDC Devnet mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 */
export const SOLANA_DEVNET_CHAIN_ID = 999999001;

export const CHAIN_INFO: Record<
  number,
  {
    name: string;
    logo: string;
    color: string;
    explorer: string;
    type: ChainType;
    typeNote?: string;
    comingSoon?: boolean;
  }
> = {
  // Tier 1
  [sepolia.id]: {
    name: "Sepolia",
    logo: "🔷",
    color: "#627EEA",
    explorer: "https://sepolia.etherscan.io",
    type: "L1",
  },
  [baseSepolia.id]: {
    name: "Base Sepolia",
    logo: "🔵",
    color: "#0052FF",
    explorer: "https://sepolia.basescan.org",
    type: "L2",
  },
  [arbitrumSepolia.id]: {
    name: "Arbitrum Sepolia",
    logo: "🟣",
    color: "#28A0F0",
    explorer: "https://sepolia.arbiscan.io",
    type: "L2",
  },
  [optimismSepolia.id]: {
    name: "OP Sepolia",
    logo: "🔴",
    color: "#FF0420",
    explorer: "https://sepolia-optimism.etherscan.io",
    type: "L2",
  },
  [polygonAmoy.id]: {
    name: "Polygon Amoy",
    logo: "🟪",
    color: "#8247E5",
    explorer: "https://amoy.polygonscan.com",
    type: "L2",
  },
  [avalancheFuji.id]: {
    name: "Avalanche Fuji",
    logo: "🔺",
    color: "#E84142",
    explorer: "https://testnet.snowtrace.io",
    type: "L1",
  },
  // Tier 2
  [unichainSepolia.id]: {
    name: "Unichain Sepolia",
    logo: "🦄",
    color: "#FF007A",
    explorer: "https://unichain-sepolia.blockscout.com",
    type: "L2",
  },
  [lineaSepolia.id]: {
    name: "Linea Sepolia",
    logo: "⚫",
    color: "#000000",
    explorer: "https://sepolia.lineascan.build",
    type: "L2",
  },
  [monadTestnet.id]: {
    name: "Monad Testnet",
    logo: "🟢",
    color: "#6E54FF",
    explorer: "https://testnet.monadexplorer.com",
    type: "L1",
  },
  [plumeSepolia.id]: {
    name: "Plume Testnet",
    logo: "🪶",
    color: "#FF6B35",
    explorer: "https://testnet-explorer.plume.org",
    type: "L2",
  },
  [inkSepolia.id]: {
    name: "Ink Sepolia",
    logo: "🟣",
    color: "#7132F5",
    explorer: "https://explorer-sepolia.inkonchain.com",
    type: "L2",
  },
  [worldchainSepolia.id]: {
    name: "World Chain Sepolia",
    logo: "🌍",
    color: "#000000",
    explorer: "https://sepolia.worldscan.org",
    type: "L2",
  },
  [sonicBlazeTestnet.id]: {
    name: "Sonic Blaze",
    logo: "💨",
    color: "#FE9A2E",
    explorer: "https://testnet.sonicscan.org",
    type: "L1",
  },
  [seiTestnet.id]: {
    name: "Sei Testnet",
    logo: "🌊",
    color: "#9B1B1B",
    explorer: "https://testnet.seiscan.io",
    type: "Cosmos+EVM",
    typeNote: "Bridge uses Sei EVM layer. Connect via MetaMask.",
  },
  // Tier 3
  [pharosTestnet.id]: {
    name: "Pharos Testnet",
    logo: "💎",
    color: "#1FE9DC",
    explorer: "https://testnet.pharosscan.xyz",
    type: "L1",
  },
  [arcTestnet.id]: {
    name: "Arc Testnet",
    logo: "⭕",
    color: "#00D4FF",
    explorer: "https://testnet.arcscan.app",
    type: "L1",
  },
  [codexTestnet.id]: {
    name: "Codex Testnet",
    logo: "📜",
    color: "#5C6BC0",
    explorer: "https://explorer.codex-stg.xyz",
    type: "L2",
  },
  [hyperliquidEvmTestnet.id]: {
    name: "HyperEVM Testnet",
    logo: "💜",
    color: "#7C3AED",
    explorer: "https://testnet.hyperevmscan.io",
    type: "EVM",
  },
  [injectiveTestnet.id]: {
    name: "Injective Testnet",
    logo: "🟠",
    color: "#00E5FF",
    explorer: "https://testnet.blockscout.injective.network",
    type: "Cosmos+EVM",
    typeNote: "Bridge uses Injective EVM (inEVM) layer. Connect via MetaMask.",
  },
  [xdcTestnet.id]: {
    name: "XDC Apothem",
    logo: "🟦",
    color: "#2A53A5",
    explorer: "https://testnet.xdcscan.com",
    type: "EVM",
  },
  [morphHoodiTestnet.id]: {
    name: "Morph Hoodi",
    logo: "🟩",
    color: "#00C896",
    explorer: "https://explorer-hoodi.morph.network",
    type: "L2",
  },
  [edgeTestnet.id]: {
    name: "EDGE Testnet",
    logo: "⬛",
    color: "#1A1A1A",
    explorer: "https://edge-testnet.explorer.alchemy.com",
    type: "L2",
  },
  // Coming Soon — Non-EVM
  [SOLANA_DEVNET_CHAIN_ID]: {
    name: "Solana Devnet",
    logo: "🟢",
    color: "#9945FF",
    explorer: "https://explorer.solana.com/?cluster=devnet",
    type: "Solana",
    typeNote: "Non-EVM chain. Requires Phantom wallet — bridge integration coming Phase 4.",
    comingSoon: true,
  },
};
