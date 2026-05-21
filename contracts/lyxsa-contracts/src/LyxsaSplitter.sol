// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ITokenMessengerV2
 * @notice Minimal interface for Circle CCTP V2 TokenMessenger
 * @dev Verified against circlefin/evm-cctp-contracts v2 (master branch).
 *      Source: src/v2/TokenMessengerV2.sol lines 145-186
 */
interface ITokenMessengerV2 {
    /**
     * @notice Burn USDC for cross-chain transfer via Circle CCTP V2
     * @dev Returns nothing — nonce is emitted via DepositForBurn event only.
     *      Caller must have approved this contract for `amount` of `burnToken`.
     */
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;
}

/**
 * @title LyxsaSplitter
 * @author Lerand (@ini_lerand)
 * @notice Atomic fan-out splitter for Circle CCTP V2 USDC bridging
 * @dev Allows users to split a single USDC source into up to 5 destination
 *      chains in a single transaction. Built on top of CCTP V2 TokenMessenger.
 *
 *      Flow per call:
 *      1. User pre-approves LyxsaSplitter for total amount
 *      2. User calls batchBurn() with N destinations (max 5)
 *      3. Contract pulls total USDC, approves TokenMessenger once
 *      4. Contract calls depositForBurn() N times
 *      5. N attestations issued by Circle Iris API
 *      6. User mints on each destination chain (off-chain orchestration)
 *
 *      CCTP V2 specifics:
 *      - destinationCaller = bytes32(0) (permissionless mint on dest)
 *      - maxFee = mandatory, deducted from minted amount on destination
 *      - minFinalityThreshold: 1000 (Fast) or 2000 (Finalized)
 *
 *      Security:
 *      - ReentrancyGuard prevents nested calls during burn loop
 *      - SafeERC20 wraps USDC interactions (handles non-standard returns)
 *      - Ownable rescueToken() recovers stuck funds (admin only)
 *      - Immutable token + messenger addresses prevent rug
 */
contract LyxsaSplitter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Maximum destinations per batch (gas + UX bound)
    uint8 public constant MAX_DESTINATIONS = 5;

    /// @notice Fast finality threshold (~8-19 sec confirmation)
    uint32 public constant FINALITY_THRESHOLD_CONFIRMED = 1000;

    /// @notice Finalized threshold (~13-19 min full finality)
    uint32 public constant FINALITY_THRESHOLD_FINALIZED = 2000;

    /// @notice CCTP V2 TokenMessenger contract (immutable per chain)
    ITokenMessengerV2 public immutable tokenMessenger;

    /// @notice USDC token address (immutable per chain)
    IERC20 public immutable usdc;

    // ============================================================
    // STRUCTS
    // ============================================================

    /// @notice Individual leg of a batch burn
    struct BurnLeg {
        uint256 amount; // USDC raw amount (6 decimals)
        uint32 destinationDomain; // CCTP destination domain
        bytes32 mintRecipient; // EVM addr padded to bytes32, or Solana pubkey
        uint256 maxFee; // Max fee user accepts (in burnToken units)
        uint32 minFinalityThreshold; // 1000=Fast, 2000=Finalized
    }

    // ============================================================
    // EVENTS
    // ============================================================

    /// @notice Emitted when a batch burn is initiated
    /// @param user Address that triggered the batch
    /// @param totalAmount Total USDC amount across all destinations
    /// @param destinationCount Number of destinations (1 to 5)
    event BatchBurnInitiated(address indexed user, uint256 totalAmount, uint8 destinationCount);

    /// @notice Emitted per individual burn within a batch
    event BurnRouted(
        address indexed user,
        uint32 indexed destinationDomain,
        bytes32 mintRecipient,
        uint256 amount,
        uint256 maxFee,
        uint32 minFinalityThreshold
    );

    // ============================================================
    // ERRORS
    // ============================================================

    error EmptyBatch();
    error TooManyDestinations(uint256 provided, uint8 max);
    error ZeroAmount(uint256 index);
    error ZeroRecipient(uint256 index);
    error InvalidFinalityThreshold(uint256 index, uint32 provided);

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _tokenMessenger CCTP V2 TokenMessenger address (per chain)
     * @param _usdc USDC token address (per chain)
     * @param _initialOwner Owner address (for rescueToken admin)
     */
    constructor(address _tokenMessenger, address _usdc, address _initialOwner)
        Ownable(_initialOwner)
    {
        require(_tokenMessenger != address(0), "Zero messenger");
        require(_usdc != address(0), "Zero USDC");
        tokenMessenger = ITokenMessengerV2(_tokenMessenger);
        usdc = IERC20(_usdc);
    }

    // ============================================================
    // CORE: BATCH BURN
    // ============================================================

    /**
     * @notice Atomically burn USDC across N CCTP V2 destinations
     * @param legs Array of burn destinations (max 5)
     *
     * Requirements:
     * - Length MUST be 1 to MAX_DESTINATIONS
     * - All amounts MUST be > 0
     * - All mintRecipients MUST be non-zero
     * - All minFinalityThreshold MUST be 1000 or 2000
     * - User MUST have pre-approved LyxsaSplitter for sum(amounts)
     *
     * @dev Track each leg's nonce off-chain via DepositForBurn event from
     *      TokenMessengerV2 (event has indexed depositor=this contract).
     *      Use Circle Iris API to fetch attestations per nonce.
     */
    function batchBurn(BurnLeg[] calldata legs) external nonReentrant {
        uint256 n = legs.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_DESTINATIONS) revert TooManyDestinations(n, MAX_DESTINATIONS);

        // Compute total + validate inputs
        uint256 total = 0;
        for (uint256 i = 0; i < n;) {
            BurnLeg calldata leg = legs[i];
            if (leg.amount == 0) revert ZeroAmount(i);
            if (leg.mintRecipient == bytes32(0)) revert ZeroRecipient(i);
            if (
                leg.minFinalityThreshold != FINALITY_THRESHOLD_CONFIRMED
                    && leg.minFinalityThreshold != FINALITY_THRESHOLD_FINALIZED
            ) {
                revert InvalidFinalityThreshold(i, leg.minFinalityThreshold);
            }
            total += leg.amount;
            unchecked {
                ++i;
            }
        }

        // Pull USDC from user (single transferFrom)
        usdc.safeTransferFrom(msg.sender, address(this), total);

        // Approve TokenMessenger for total (forceApprove handles non-standard USDC)
        usdc.forceApprove(address(tokenMessenger), total);

        // Execute N burns (CCTP V2 returns void; nonces are event-only)
        for (uint256 i = 0; i < n;) {
            BurnLeg calldata leg = legs[i];
            tokenMessenger.depositForBurn(
                leg.amount,
                leg.destinationDomain,
                leg.mintRecipient,
                address(usdc),
                bytes32(0), // permissionless mint on destination
                leg.maxFee,
                leg.minFinalityThreshold
            );

            emit BurnRouted(
                msg.sender,
                leg.destinationDomain,
                leg.mintRecipient,
                leg.amount,
                leg.maxFee,
                leg.minFinalityThreshold
            );

            unchecked {
                ++i;
            }
        }

        // forge-lint: disable-next-line(unsafe-typecast) — n bounded by MAX_DESTINATIONS=5
        emit BatchBurnInitiated(msg.sender, total, uint8(n));
    }

    // ============================================================
    // ADMIN: RESCUE
    // ============================================================

    /**
     * @notice Rescue any ERC20 stuck in this contract (admin only)
     * @dev USDC should never sit here under normal flow (transferFrom → approve → burn)
     *      but this function provides recovery path for edge cases.
     */
    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero recipient");
        token.safeTransfer(to, amount);
    }

    /**
     * @notice Rescue native ETH stuck in this contract (admin only)
     * @dev Defensive — contract has no payable functions, but covers edge cases
     */
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero recipient");
        (bool ok,) = to.call{ value: amount }("");
        require(ok, "ETH rescue failed");
    }
}
