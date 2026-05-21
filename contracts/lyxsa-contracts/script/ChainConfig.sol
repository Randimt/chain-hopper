// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Per-chain CCTP V2 configuration
/// @notice Centralized config for all chains Lyxsa supports
///         Source: https://developers.circle.com/stablecoins/evm-smart-contracts
library ChainConfig {
    /// @dev CCTP V2 TokenMessenger — SAME address on all V2 testnets (deterministic Circle deploy)
    address internal constant CCTP_V2_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    /// @dev Per-chain USDC addresses (testnet)
    address internal constant USDC_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant USDC_ARC_TESTNET = 0x3600000000000000000000000000000000000000;
    address internal constant USDC_ARBITRUM_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    /// @dev CCTP domain IDs per chain
    uint32 internal constant DOMAIN_SEPOLIA = 0;
    uint32 internal constant DOMAIN_AVALANCHE_FUJI = 1;
    uint32 internal constant DOMAIN_OP_SEPOLIA = 2;
    uint32 internal constant DOMAIN_ARBITRUM_SEPOLIA = 3;
    uint32 internal constant DOMAIN_SOLANA_DEVNET = 5;
    uint32 internal constant DOMAIN_BASE_SEPOLIA = 6;
    uint32 internal constant DOMAIN_POLYGON_AMOY = 7;
    uint32 internal constant DOMAIN_ARC_TESTNET = 26;

    function usdcFor(uint256 chainId) internal pure returns (address) {
        if (chainId == 11155111) return USDC_SEPOLIA;
        if (chainId == 84532) return USDC_BASE_SEPOLIA;
        if (chainId == 5042002) return USDC_ARC_TESTNET;
        if (chainId == 421614) return USDC_ARBITRUM_SEPOLIA;
        revert("ChainConfig: unsupported chain");
    }
}
