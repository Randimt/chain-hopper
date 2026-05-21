// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {LyxsaSplitter} from "../src/LyxsaSplitter.sol";

/// @title CREATE2 Determinism Test
/// @notice Verifies that LyxsaSplitter deploys to the same address across chains
///         given identical salt + bytecode + constructor args.
contract DeployDeterminismTest is Test {
    bytes32 public constant SALT = keccak256("LYXSA_SPLITTER_V1");

    address constant CCTP_V2_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address constant USDC_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant USDC_ARC = 0x3600000000000000000000000000000000000000;
    address constant USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    address deployer = makeAddr("deployer");

    function _predictAddress(address usdc) internal view returns (address) {
        return _predictAddressFrom(CREATE2_FACTORY, usdc);
    }

    function _predictAddressFrom(address create2Origin, address usdc)
        internal
        view
        returns (address)
    {
        bytes memory creationCode = abi.encodePacked(
            type(LyxsaSplitter).creationCode, abi.encode(CCTP_V2_TOKEN_MESSENGER, usdc, deployer)
        );
        return vm.computeCreate2Address(SALT, keccak256(creationCode), create2Origin);
    }

    function test_DifferentUsdcAddresses_ProduceDifferentContractAddresses() public view {
        // Different USDC = different bytecode = different address (expected per chain)
        address sepoliaAddr = _predictAddress(USDC_SEPOLIA);
        address baseAddr = _predictAddress(USDC_BASE_SEPOLIA);
        address arcAddr = _predictAddress(USDC_ARC);
        address arbAddr = _predictAddress(USDC_ARB_SEPOLIA);

        assertTrue(sepoliaAddr != baseAddr, "Sepolia/Base should differ");
        assertTrue(sepoliaAddr != arcAddr, "Sepolia/Arc should differ");
        assertTrue(baseAddr != arbAddr, "Base/Arb should differ");

        console2.log("Predicted addresses (vary by USDC):");
        console2.log("  Sepolia: ", sepoliaAddr);
        console2.log("  Base:    ", baseAddr);
        console2.log("  Arc:     ", arcAddr);
        console2.log("  Arb:     ", arbAddr);
    }

    function test_SameUsdc_SameDeployer_SameAddress() public view {
        // Same constructor args = same address regardless of where computed
        address addr1 = _predictAddress(USDC_SEPOLIA);
        address addr2 = _predictAddress(USDC_SEPOLIA);

        assertEq(addr1, addr2, "Determinism: same args = same address");
    }

    function test_DeployActuallyMatchesPrediction() public {
        // When deploying directly with `new {salt}`, deployer EOA is the CREATE2 origin
        address predicted = _predictAddressFrom(deployer, USDC_SEPOLIA);

        vm.prank(deployer);
        LyxsaSplitter splitter =
            new LyxsaSplitter{salt: SALT}(CCTP_V2_TOKEN_MESSENGER, USDC_SEPOLIA, deployer);

        assertEq(address(splitter), predicted, "Deploy address must match prediction");
    }

    function test_DifferentSalt_ProducesDifferentAddress() public view {
        bytes32 saltV1 = keccak256("LYXSA_SPLITTER_V1");
        bytes32 saltV2 = keccak256("LYXSA_SPLITTER_V2");

        bytes memory creationCode = abi.encodePacked(
            type(LyxsaSplitter).creationCode,
            abi.encode(CCTP_V2_TOKEN_MESSENGER, USDC_SEPOLIA, deployer)
        );

        address addrV1 = vm.computeCreate2Address(saltV1, keccak256(creationCode));
        address addrV2 = vm.computeCreate2Address(saltV2, keccak256(creationCode));

        assertTrue(addrV1 != addrV2, "Different salt = different address");
    }
}
