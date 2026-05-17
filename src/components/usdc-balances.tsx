"use client";

import { useAccount, useReadContracts, useBalance } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { USDC_ADDRESSES, CHAIN_INFO, ARC_TESTNET_CHAIN_ID } from "@/lib/wagmi";

const ERC20_CHAIN_IDS = Object.keys(USDC_ADDRESSES).map(Number);

export function UsdcBalances() {
  const { address, isConnected } = useAccount();

  // Read USDC balance on 6 ERC20 testnet chains via multicall
  const {
    data: erc20Data,
    isLoading: erc20Loading,
    error: erc20Error,
  } = useReadContracts({
    contracts: ERC20_CHAIN_IDS.map((chainId) => ({
      address: USDC_ADDRESSES[chainId],
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address!],
      chainId,
    })),
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  // Arc Testnet USDC = native gas token (not ERC20)
  // Use useBalance for native currency balance
  const {
    data: arcBalance,
    isLoading: arcLoading,
    error: arcError,
  } = useBalance({
    address,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  const isLoading = erc20Loading || arcLoading;
  const error = erc20Error || arcError;

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Connect your wallet to see USDC balances</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-400">Loading balances...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
        <p className="text-red-400">Error loading balances. Check your connection.</p>
      </div>
    );
  }

  // 6 ERC20 testnet chains (USDC = 6 decimals)
  const erc20Balances = ERC20_CHAIN_IDS.map((chainId, i) => {
    const result = erc20Data?.[i];
    const raw = result?.status === "success" ? (result.result as bigint) : BigInt(0);
    const formatted = parseFloat(formatUnits(raw, 6));
    return { chainId, balance: formatted, info: CHAIN_INFO[chainId] };
  });

  // Arc Testnet — native USDC (18 decimals, like ETH)
  const arcFormatted = arcBalance ? parseFloat(formatUnits(arcBalance.value, 18)) : 0;
  const arcEntry = {
    chainId: ARC_TESTNET_CHAIN_ID,
    balance: arcFormatted,
    info: CHAIN_INFO[ARC_TESTNET_CHAIN_ID],
  };

  const balances = [...erc20Balances, arcEntry];
  const total = balances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <div className="space-y-4">
      {/* Total card — static gradient, no animation */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-blue-950/40 to-zinc-900/50 p-6">
        <p className="text-sm text-zinc-400 uppercase tracking-wider">Total USDC (Testnet)</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          ${total.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">across {balances.length} testnet chains</p>
      </div>

      {/* Per-chain breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {balances.map(({ chainId, balance, info }) => (
          <div
            key={chainId}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{info.logo}</span>
              <span className="text-sm font-medium text-zinc-300">{info.name}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {balance.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-500">
              USDC{chainId === ARC_TESTNET_CHAIN_ID && " (native)"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
