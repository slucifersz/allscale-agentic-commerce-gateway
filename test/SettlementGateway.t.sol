// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/SettlementGateway.sol";
import "../contracts/MockERC20.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 revertData) external;
    function prank(address msgSender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract SettlementGatewayTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SettlementGateway private gateway;
    MockERC20 private token;

    uint256 private gatewayKey;
    uint256 private agentKey;
    address private owner;
    address private gatewaySigner;
    address private agent;
    address private treasury;

    struct Checkout {
        bytes32 checkoutId;
        bytes32 merchantId;
        address agent;
        address token;
        uint256 amount;
        address treasury;
        uint256 expiresAt;
        bytes32 metadataHash;
    }

    error AssertionFailed();

    function setUp() public {
        gatewayKey = uint256(keccak256("allscale.gateway.signer.test"));
        agentKey = uint256(keccak256("allscale.agent.test"));

        owner = address(this);
        gatewaySigner = vm.addr(gatewayKey);
        agent = vm.addr(agentKey);
        treasury = address(0xBEEF);

        token = new MockERC20("Mock USDC", "mUSDC", 6);
        gateway = new SettlementGateway(owner, gatewaySigner);

        token.mint(agent, 1_000_000_000);
        gateway.setSpendingLimit(agent, 100_000_000);

        vm.prank(agent);
        token.approve(address(gateway), type(uint256).max);
    }

    function testPayTransfersTokensAndRecordsSettlement() public {
        Checkout memory c = _checkout(25_000_000);
        bytes memory signature = _sign(c);

        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );

        _assertEq(token.balanceOf(treasury), c.amount);
        _assertTrue(gateway.settledCheckouts(c.checkoutId));
        _assertEq(gateway.spentByAgent(agent), c.amount);
    }

    function testRejectsExpiredCheckout() public {
        Checkout memory c = _checkout(25_000_000);
        c.expiresAt = block.timestamp - 1;
        bytes memory signature = _sign(c);

        vm.expectRevert(SettlementGateway.CheckoutExpired.selector);
        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );
    }

    function testRejectsInvalidSignature() public {
        Checkout memory c = _checkout(25_000_000);
        bytes memory signature = _sign(c);
        uint256 tamperedAmount = c.amount + 1;

        vm.expectRevert(SettlementGateway.InvalidGatewaySignature.selector);
        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            tamperedAmount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );
    }

    function testRejectsReplay() public {
        Checkout memory c = _checkout(25_000_000);
        bytes memory signature = _sign(c);

        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );

        vm.expectRevert(SettlementGateway.CheckoutAlreadySettled.selector);
        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );
    }

    function testRejectsSpendAboveLimit() public {
        Checkout memory c = _checkout(25_000_000);
        gateway.setSpendingLimit(agent, c.amount - 1);
        bytes memory signature = _sign(c);

        vm.expectRevert(SettlementGateway.SpendingLimitExceeded.selector);
        vm.prank(agent);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );
    }

    function testRejectsWrongAgentSender() public {
        Checkout memory c = _checkout(25_000_000);
        bytes memory signature = _sign(c);

        vm.expectRevert(SettlementGateway.AgentMismatch.selector);
        gateway.pay(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash,
            signature
        );
    }

    function testOnlyOwnerCanSetSpendingLimit() public {
        vm.expectRevert(SettlementGateway.NotOwner.selector);
        vm.prank(agent);
        gateway.setSpendingLimit(agent, 1);
    }

    function _checkout(uint256 amount) private view returns (Checkout memory) {
        return Checkout({
            checkoutId: keccak256("checkout-1"),
            merchantId: keccak256("merchant-demo"),
            agent: agent,
            token: address(token),
            amount: amount,
            treasury: treasury,
            expiresAt: block.timestamp + 15 minutes,
            metadataHash: keccak256("metadata")
        });
    }

    function _sign(Checkout memory c) private returns (bytes memory) {
        bytes32 digest = gateway.getCheckoutDigest(
            c.checkoutId,
            c.merchantId,
            c.agent,
            c.token,
            c.amount,
            c.treasury,
            c.expiresAt,
            c.metadataHash
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(gatewayKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertTrue(bool value) private pure {
        if (!value) revert AssertionFailed();
    }

    function _assertEq(uint256 left, uint256 right) private pure {
        if (left != right) revert AssertionFailed();
    }
}
