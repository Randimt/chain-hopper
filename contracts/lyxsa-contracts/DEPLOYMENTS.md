# LyxsaSplitter Deployments

Production-grade CCTP V2 fan-out splitter deployed via CREATE2 deterministic deployment.

## Active Deployments (Testnet)

| Chain | Chain ID | CCTP Domain | Address | Explorer | Status |
|-------|----------|-------------|---------|----------|--------|
| Sepolia | 11155111 | 0 | [`0x8806AE628C9580Ec147B49D54a6731A2E815647C`](https://sepolia.etherscan.io/address/0x8806AE628C9580Ec147B49D54a6731A2E815647C) | Etherscan | ✅ Verified |
| Base Sepolia | 84532 | 6 | [`0xC5C77a0f41326764ABCa14737e074e78099A8915`](https://sepolia.basescan.org/address/0xC5C77a0f41326764ABCa14737e074e78099A8915) | Basescan | ✅ Verified |
| Arbitrum Sepolia | 421614 | 3 | [`0x6c85f0F146FF195836C6E10f50b09D57F68ee300`](https://sepolia.arbiscan.io/address/0x6c85f0F146FF195836C6E10f50b09D57F68ee300) | Arbiscan | ✅ Verified |
| Arc Testnet | 5042002 | 26 | [`0x1E287e9BDD9BF20131F39DAca09c689C08C2365E`](https://testnet.arcscan.app/address/0x1E287e9BDD9BF20131F39DAca09c689C08C2365E) | Arcscan | ⚠️ Manual verify pending |

## Deployment Metadata

- **Deployer**: `0x2d7d385EBc0fA0017621fcd8dCd3D94091A1eacf`
- **Salt**: `keccak256("LYXSA_SPLITTER_V1")`
- **Compiler**: Solidity 0.8.24 + optimizer (runs: 200)
- **EVM Version**: Cancun
- **CCTP V2 TokenMessenger**: `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` (same address all V2 testnets)

## Why Different Addresses Per Chain

Even with CREATE2 + same salt + same deployer, addresses differ because:
- **USDC contract address differs per chain** (testnet quirk)
- USDC address is part of constructor args → bytecode hash differs → CREATE2 address differs

For mainnet (where USDC = same canonical address `0xa0b86991c6...` on Ethereum), this would resolve to a single address across all chains.

## Verify Source Code

```bash
# Sepolia (already verified — example)
forge verify-contract \
  0x8806AE628C9580Ec147B49D54a6731A2E815647C \
  src/LyxsaSplitter.sol:LyxsaSplitter \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" \
    0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA \
    0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
    0x2d7d385EBc0fA0017621fcd8dCd3D94091A1eacf) \
  --watch
```
