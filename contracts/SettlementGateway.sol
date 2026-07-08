// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * SettlementGateway — STUB / interface skeleton.
 *
 * Target network: HashKey Chain testnet (chainId 133).
 *
 * This file defines the intended interface of the settlement contract only.
 * The real implementation and deployment are provided manually later;
 * no address, tx hash, or deployment claim exists in this repo yet
 * (see deployments/hashkey-testnet.json — all values _TBD except chainId).
 *
 * Design notes:
 *  - The spending limit is enforced HERE, on-chain, by this contract.
 *    It is NOT decided by any off-chain verifier (and not by Primus).
 *  - Off-chain verification (Gate 1 KYT/AML, Gate 2 KYC/Authorization)
 *    happens BEFORE settle() is ever called; a checkout that fails either
 *    gate is blocked off-chain and never reaches this contract.
 */
contract SettlementGateway {
    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// Emitted when a canonical checkout settles to the merchant treasury.
    event CheckoutSettled(
        bytes32 indexed checkoutId,
        address indexed token,
        uint256 amount,
        address indexed treasury,
        bytes32 metadataHash
    );

    /// Emitted when a per-agent spending limit is set or updated.
    event SpendingLimitUpdated(address indexed agent, uint256 newLimit);

    // ---------------------------------------------------------------------
    // Settlement entry point (skeleton — not implemented)
    // ---------------------------------------------------------------------

    /**
     * Settle a canonical checkout to the merchant treasury.
     *
     * @param checkoutId    Canonical checkout identifier (from the router)
     * @param token         ERC-20 token to settle in
     * @param amount        Settlement amount (must pass the on-chain spending-limit check)
     * @param treasury      Merchant treasury address
     * @param expiry        Checkout expiry timestamp (revert if expired)
     * @param metadataHash  Hash of the canonical checkout metadata
     */
    function settle(
        bytes32 checkoutId,
        address token,
        uint256 amount,
        address treasury,
        uint256 expiry,
        bytes32 metadataHash
    ) external {
        // _TBD — implementation provided with the real deployment.
        revert("SettlementGateway: not implemented (stub)");
    }

    // ---------------------------------------------------------------------
    // Spending limit (enforced on-chain by this contract)
    // ---------------------------------------------------------------------

    /**
     * Check whether an agent's proposed spend is within its on-chain limit.
     * This on-chain check is the authoritative spending-limit decision.
     */
    function isWithinSpendingLimit(address agent, uint256 amount)
        external
        view
        returns (bool)
    {
        // _TBD — implementation provided with the real deployment.
        return false;
    }

    /**
     * Set the spending limit for an agent (access control _TBD).
     */
    function setSpendingLimit(address agent, uint256 limit) external {
        // _TBD — implementation provided with the real deployment.
        revert("SettlementGateway: not implemented (stub)");
    }
}
