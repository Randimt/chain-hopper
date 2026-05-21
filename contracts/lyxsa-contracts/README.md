# Lyxsa Contracts

Smart contracts powering **Lyxsa Phase 4 — Batch Bridge (Fan-out Splitter)**.

`LyxsaSplitter.sol` lets a user split USDC across up to 5 destination chains in a single transaction by wrapping Circle's CCTP V2 `depositForBurn`.

## Architecture

```
User → approve(LyxsaSplitter, total) → batchBurn([leg1, leg2, ..., leg5])
                                            ↓
                          1× transferFrom + 1× forceApprove
                                            ↓
                            N× tokenMessenger.depositForBurn()
                                            ↓
                       N× MessageSent events → Iris API attestations
                                            ↓
                   N× mint on destination chains (frontend handles)
```

**Key properties:**
- Atomic — all-or-revert (single batch tx)
- Native USDC — no wrapped tokens
- Reentrancy-guarded (OpenZeppelin)
- Custom errors (gas efficient)
- CCTP V2 `depositForBurn` (7-param signature, void return)
- CREATE2 deterministic address (same address across all chains given same constructor args)

## Setup

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
cd contracts/lyxsa-contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit

# Build
forge build

# Test
forge test
```

## Test

```bash
forge test                                 # all tests
forge test --match-contract LyxsaSplitter  # main suite (21 tests)
forge test --match-contract Determinism    # CREATE2 tests (4 tests)
forge test --gas-report                    # gas profiling
```

Current status: **25/25 passing, 512 fuzz runs, Slither audit clean.**

## Deploy

```bash
# Copy + fill env
cp .env.example .env
# edit .env with DEPLOYER_PRIVATE_KEY + RPC URLs + Etherscan keys

# Predict address (no broadcast)
forge script script/Deploy.s.sol:Deploy --rpc-url sepolia

# Deploy + verify
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url sepolia \
  --broadcast \
  --verify
```

## Layout

```
src/
  LyxsaSplitter.sol         # main contract (~250 lines)
test/
  LyxsaSplitter.t.sol       # unit + fuzz + reentrancy (21 tests)
  DeployDeterminism.t.sol   # CREATE2 verification (4 tests)
  mocks/
    MockTokenMessengerV2.sol
script/
  Deploy.s.sol              # CREATE2 deployer
  ChainConfig.sol           # per-chain CCTP V2 + USDC addresses
```

## Status

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | Foundry setup + skeleton | ✅ |
| 2 | Foundry tests (21 tests) | ✅ |
| 3 | Gas profile + Slither audit | ✅ |
| 4 | CREATE2 deploy script | ✅ |
| 5 | Sepolia deploy + verified | ✅ |
| 6 | Multi-chain deploy (4 chains) | ✅ |
| 7 | Frontend `/batch` integration | ⏳ |
| 8 | Multi-attestation tracking | ⏳ |
| 9 | Polish + ship | ⏳ |

See [DEPLOYMENTS.md](./DEPLOYMENTS.md) for live contract addresses across 4 testnets.
