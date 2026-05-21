// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title MockTokenMessengerV2
 * @notice Test mock that mirrors Circle CCTP V2 TokenMessenger interface
 * @dev Tracks all depositForBurn calls for assertion in tests.
 *      Burns USDC by transferring to address(0xdead) (no real CCTP).
 */
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTokenMessengerV2 {
    struct BurnCall {
        address caller;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
    }

    BurnCall[] public burnHistory;

    /// @dev Burn = transfer to dead address to verify allowance flow
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Set to true to make depositForBurn revert (for failure tests)
    bool public shouldRevert;

    /// @notice Custom revert message when shouldRevert=true
    string public revertReason = "MOCK_REVERT";

    function setShouldRevert(bool _shouldRevert, string calldata _reason) external {
        shouldRevert = _shouldRevert;
        revertReason = _reason;
    }

    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external {
        if (shouldRevert) {
            revert(revertReason);
        }

        // Pull tokens (verifies caller approved this mock)
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        IERC20(burnToken).transferFrom(msg.sender, DEAD, amount);

        burnHistory.push(
            BurnCall({
                caller: msg.sender,
                amount: amount,
                destinationDomain: destinationDomain,
                mintRecipient: mintRecipient,
                burnToken: burnToken,
                destinationCaller: destinationCaller,
                maxFee: maxFee,
                minFinalityThreshold: minFinalityThreshold
            })
        );
    }

    function burnCallCount() external view returns (uint256) {
        return burnHistory.length;
    }

    function getBurnCall(uint256 index) external view returns (BurnCall memory) {
        return burnHistory[index];
    }
}
