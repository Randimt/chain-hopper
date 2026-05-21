// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {LyxsaSplitter} from "../src/LyxsaSplitter.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @title Deploy LyxsaSplitter via CREATE2 deterministic deployer
/// @notice Same salt + same bytecode + same constructor args = same address across all chains
///         Auto-resolves USDC address from ChainConfig based on block.chainid.
///
/// USAGE (single chain):
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url <chain> \
///     --broadcast \
///     --verify
///
/// PREDICT ADDRESS (no broadcast):
///   forge script script/Deploy.s.sol:Deploy --rpc-url <chain>
contract Deploy is Script {
    /// @dev Salt for CREATE2 — bump version suffix for breaking changes
    bytes32 public constant SALT = keccak256("LYXSA_SPLITTER_V1");

    function run() external returns (LyxsaSplitter splitter) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Auto-resolve USDC from chain ID
        address usdc = ChainConfig.usdcFor(block.chainid);
        address messenger = ChainConfig.CCTP_V2_TOKEN_MESSENGER;

        // Predict CREATE2 address before deploy
        bytes memory creationCode =
            abi.encodePacked(type(LyxsaSplitter).creationCode, abi.encode(messenger, usdc, deployer));
        address predicted = vm.computeCreate2Address(SALT, keccak256(creationCode));

        console2.log("=== LyxsaSplitter Deployment ===");
        console2.log("Chain ID:        ", block.chainid);
        console2.log("Deployer:        ", deployer);
        console2.log("TokenMessenger:  ", messenger);
        console2.log("USDC:            ", usdc);
        console2.log("Salt:            ", vm.toString(SALT));
        console2.log("Predicted addr:  ", predicted);

        // Skip if already deployed at predicted address
        if (predicted.code.length > 0) {
            console2.log("Already deployed at:", predicted);
            return LyxsaSplitter(payable(predicted));
        }

        vm.startBroadcast(deployerKey);
        splitter = new LyxsaSplitter{salt: SALT}(messenger, usdc, deployer);
        vm.stopBroadcast();

        require(address(splitter) == predicted, "CREATE2: address mismatch");
        console2.log("Deployed at:     ", address(splitter));
    }
}
