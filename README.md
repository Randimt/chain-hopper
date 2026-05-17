# 🌐 Chain Hopper

> Multi-chain USDC viewer built with Next.js, wagmi, and viem. View your USDC balances across 6 EVM chains in real-time.

![Built with Circle USDC](https://img.shields.io/badge/Built%20with-Circle%20USDC-0052FF)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![wagmi v2](https://img.shields.io/badge/wagmi-v2-blue)

## ✨ Features

- 🔌 **Multi-wallet support** — MetaMask, WalletConnect, Coinbase, Rabby (via RainbowKit)
- 💰 **Real-time USDC balances** across 6 EVM chains:
  - 🔷 Ethereum
  - 🔵 Base
  - 🟣 Arbitrum
  - 🔴 Optimism
  - 🟪 Polygon
  - 🔺 Avalanche
- ⚡ **Multicall optimized** — single batched query per chain
- 🔄 **Auto-refresh** every 30 seconds
- 🎨 **Dark mode** UI with minimal animations (performance-first)

## 🚀 Coming Soon

- 🌉 **Bridge** — CCTP cross-chain USDC transfers
- 🔄 **Swap** — Multi-DEX aggregation
- 📜 **Recipes** — Save & schedule routing strategies

## 🛠 Tech Stack

- [Next.js 16](https://nextjs.org/) — React framework
- [wagmi v2](https://wagmi.sh/) — Ethereum hooks
- [viem](https://viem.sh/) — TypeScript Ethereum interface
- [RainbowKit](https://www.rainbowkit.com/) — Wallet connection UI
- [Tailwind CSS v4](https://tailwindcss.com/) — Styling
- [Circle USDC](https://www.circle.com/usdc) — Stablecoin

## 🏃 Local Development

```bash
git clone https://github.com/Randimt/chain-hopper.git
cd chain-hopper
pnpm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local
pnpm dev
```

Open http://localhost:3000

## 🌍 Deploy

Deploy your own instance to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Randimt/chain-hopper)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Recommended | Get free at [cloud.walletconnect.com](https://cloud.walletconnect.com) |

## 📜 License

MIT

## 👤 Author

Built by [Randi MT (Lerand)](https://github.com/Randimt) — Blockchain Developer & Web3 Researcher.
