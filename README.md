# Lyxsa

> Cross-chain USDC bridging dApp — 22 EVM testnets + Solana Devnet with multi-output recipes and atomic batch fan-out, powered by Circle CCTP V2.

![Built with Circle CCTP V2](https://img.shields.io/badge/Built%20with-Circle%20CCTP%20V2-0052FF)
![Next.js 15](https://img.shields.io/badge/Next.js-15-black)
![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF)
![Status](https://img.shields.io/badge/Status-Beta-success)

**Live:** [app.lyxsa.xyz](https://app.lyxsa.xyz)

---

## What Lyxsa Does

Native USDC bridging in 30 seconds across 22 EVM testnets + Solana Devnet, with reusable multi-output recipes and atomic batch fan-out for splitting USDC across multiple chains in a single transaction.

### Cross-VM Bridge — LIVE

- Bidirectional EVM to Solana via Circle Bridge Kit
- 22 EVM testnets (Sepolia, Base, Arbitrum, Optimism, Polygon, Avalanche, Linea, Sonic, Sei, Codex, Plume, Unichain, ZKsync, WorldChain, Mantle, XDC, HyperEVM, Injective, Morph, Edge, Pharos, Arc Testnet)
- Native USDC mint/burn (no wrapped tokens)
- Multi-aggregator quote engine (CCTP V2 + Relay + Across)

### Recipes — LIVE

- Save bridge configs as reusable presets
- Multi-output sequential queue — split USDC across N chains in 1 click
- Cross-VM recipes (EVM to Solana, Solana to EVM)
- Per-output skip/cancel + refresh-safe resume
- Built-in templates: Diversify L2, Cross-VM split, Solana focus

### Batch Bridge — LIVE Beta

- LyxsaSplitter.sol — atomic fan-out splitter contract deployed on 4 testnets
- Bridge USDC from 1 source to up to 5 destinations in a single transaction
- Single approve, single batch tx, per-leg parallel attestation tracking
- 25 tests passing, Slither audit clean, CREATE2 deterministic
- Try it at `/batch`

### Universal Recovery Hub

- If a bridge fails mid-flow (burn succeeded but mint pending), the burn is auto-saved to History as Reclaimable
- Batch recovery routes to `/batch?recover=<txHash>` for multi-leg attestation tracking
- Single-tx recovery routes to `/bridge?reclaim=<id>` (legacy compatible)
- Reclaim anytime — CCTP V2 attestations are permanent
- No silent USDC loss

---

## Roadmap

| Phase | Feature | Status | ETA |
|-------|---------|--------|-----|
| 01 | Native USDC bridging (22 EVM) | LIVE | Q2 2026 |
| 02 | Solana cross-VM integration | LIVE | Q2 2026 |
| 03 | Recipes & batching (sequential queue) | LIVE Beta | Q2 2026 |
| 04 | Batch bridge (atomic fan-out splitter) | LIVE Beta | Q2 2026 |
| 05 | Move VM expansion (Aptos + Sui) | PLANNED | Q4 2026 |
| 06 | Multi-aggregator + swap | PLANNED | 2027 |

---

## Tech Stack

**Frontend**
- [Next.js 15](https://nextjs.org/) + React 19 + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) + Framer Motion
- [Cloudflare Workers + Pages](https://workers.cloudflare.com/) (deployment)

**Web3 / Multi-VM**
- [viem 2.x](https://viem.sh/) + [wagmi 2.x](https://wagmi.sh/) (EVM wallets)
- [@solana/wallet-adapter](https://github.com/anza-xyz/wallet-adapter) (Solana wallets)
- [@circle-fin/bridge-kit](https://www.npmjs.com/package/@circle-fin/bridge-kit) 1.10 (cross-VM CCTP V2)
- [@reservoir0x/relay-sdk](https://docs.relay.link/) + [@across-protocol/app-sdk](https://docs.across.to/) (alternative routes)
- [RainbowKit](https://www.rainbowkit.com/) (EVM wallet UI)
- [Circle Iris API](https://developers.circle.com/stablecoins/cctp-getting-started) (attestation)

**Smart Contracts**
- [Foundry](https://getfoundry.sh/) (development, testing, deployment)
- [Solidity 0.8.24](https://docs.soliditylang.org/) (compiler)
- [OpenZeppelin Contracts](https://www.openzeppelin.com/contracts) (ReentrancyGuard, SafeERC20, Ownable)
- [Slither](https://github.com/crytic/slither) (static analysis)

**Wallets supported**
- EVM: MetaMask, WalletConnect, Coinbase, Rabby
- Solana: Phantom, Solflare, Backpack, OKX

---

## Local Development

```bash
git clone https://github.com/Randimt/Lyxsa.git
cd Lyxsa
pnpm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local
pnpm dev
```

Open http://localhost:3000

### Smart Contract Development

```bash
cd contracts/lyxsa-contracts
forge install
forge build
forge test
```

See [`contracts/lyxsa-contracts/README.md`](contracts/lyxsa-contracts/README.md) for full setup and deployment guide.

---

## Deploy

Deploy your own instance to Cloudflare Workers (or Vercel):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Randimt/Lyxsa)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Recommended | Get free at [cloud.walletconnect.com](https://cloud.walletconnect.com) |

---

## Deployed Contracts

### LyxsaSplitter — Phase 4 fan-out batch bridge

CREATE2 deterministic deploy. Bridge USDC from 1 source to up to 5 destinations atomically.

| Chain | Contract Address | Explorer |
|-------|-----------------|----------|
| Sepolia | `0x8806AE628C9580Ec147B49D54a6731A2E815647C` | [Etherscan (Verified)](https://sepolia.etherscan.io/address/0x8806AE628C9580Ec147B49D54a6731A2E815647C) |
| Base Sepolia | `0xC5C77a0f41326764ABCa14737e074e78099A8915` | [Basescan (Verified)](https://sepolia.basescan.org/address/0xC5C77a0f41326764ABCa14737e074e78099A8915) |
| Arbitrum Sepolia | `0x6c85f0F146FF195836C6E10f50b09D57F68ee300` | [Arbiscan (Verified)](https://sepolia.arbiscan.io/address/0x6c85f0F146FF195836C6E10f50b09D57F68ee300) |
| Arc Testnet | `0x1E287e9BDD9BF20131F39DAca09c689C08C2365E` | [Arcscan](https://testnet.arcscan.app/address/0x1E287e9BDD9BF20131F39DAca09c689C08C2365E) |

Source code: [`contracts/lyxsa-contracts/`](contracts/lyxsa-contracts/)

**Quality:**
- 25 Foundry tests passing (512 fuzz runs)
- Slither static analysis: clean (no HIGH or MEDIUM findings)
- CCTP V2 Fast Transfer enabled (~30 second attestation)
- Reentrancy guarded, SafeERC20, custom errors

### Integrated CCTP V2 Protocol Contracts

**Arc Testnet (chain ID 5042002, CCTP domain 26):**
- TokenMessenger: `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`
- MessageTransmitter: `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275`
- USDC: `0x3600000000000000000000000000000000000000`

**Solana Devnet:**
- TokenMessengerMinter: `CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe`
- MessageTransmitter: `CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC`
- USDC Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

Full chain config: [`src/lib/wagmi.ts`](src/lib/wagmi.ts)

---

## License

MIT

---

## Author

Built by [Lerand (@ini_lerand)](https://twitter.com/ini_lerand) — Blockchain Developer & Web3 Researcher.

- Email: `randimuhtajularipin@gmail.com`
- Twitter: [@ini_lerand](https://twitter.com/ini_lerand)
- GitHub: [Randimt](https://github.com/Randimt)
