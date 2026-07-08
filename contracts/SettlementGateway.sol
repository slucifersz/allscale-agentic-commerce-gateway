// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value)
        external
        returns (bool);
}

/**
 * SettlementGateway — MVP implementation.
 *
 * Target network: HashKey Chain testnet (chainId 133), plus local Anvil for
 * development. KYT / KYC gates are still off-chain mock handlers in this repo.
 *
 * This contract is the authoritative on-chain spending-limit and settlement
 * layer. It receives signed canonical checkout terms from the gateway, prevents
 * replay, enforces per-agent cumulative spending limits, and moves ERC-20 funds
 * directly from the agent wallet to the merchant treasury.
 */
contract SettlementGateway {
    string public constant NAME = "AllScale SettlementGateway";
    string public constant VERSION = "1";

    bytes32 public constant CHECKOUT_TYPEHASH = keccak256(
        "Checkout(bytes32 checkoutId,bytes32 merchantId,address agent,address token,uint256 amount,address treasury,uint256 expiresAt,bytes32 metadataHash)"
    );

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public owner;
    address public gatewaySigner;
    uint256 public immutable deploymentChainId;
    bytes32 private immutable cachedDomainSeparator;

    mapping(bytes32 => bool) public settledCheckouts;
    mapping(address => uint256) public spendingLimits;
    mapping(address => uint256) public spentByAgent;

    bool private locked;

    error AmountIsZero();
    error AgentMismatch();
    error CheckoutAlreadySettled();
    error CheckoutExpired();
    error InvalidAddress();
    error InvalidGatewaySignature();
    error NotOwner();
    error Reentrancy();
    error SpendingLimitExceeded(uint256 limit, uint256 attemptedSpend);
    error TokenTransferFailed();

    event CheckoutSettled(
        bytes32 indexed checkoutId,
        bytes32 indexed merchantId,
        address indexed agent,
        address token,
        uint256 amount,
        address treasury,
        bytes32 metadataHash
    );

    event GatewaySignerUpdated(address indexed oldSigner, address indexed newSigner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event SpendingLimitUpdated(address indexed agent, uint256 newLimit);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(address initialOwner, address initialGatewaySigner) {
        if (initialOwner == address(0) || initialGatewaySigner == address(0)) {
            revert InvalidAddress();
        }

        owner = initialOwner;
        gatewaySigner = initialGatewaySigner;
        deploymentChainId = block.chainid;
        cachedDomainSeparator = _buildDomainSeparator();

        emit OwnershipTransferred(address(0), initialOwner);
        emit GatewaySignerUpdated(address(0), initialGatewaySigner);
    }

    function pay(
        bytes32 checkoutId,
        bytes32 merchantId,
        address agent,
        address token,
        uint256 amount,
        address treasury,
        uint256 expiresAt,
        bytes32 metadataHash,
        bytes calldata gatewaySignature
    ) external nonReentrant {
        if (agent != msg.sender) revert AgentMismatch();
        if (token == address(0) || treasury == address(0)) revert InvalidAddress();
        if (amount == 0) revert AmountIsZero();
        if (block.timestamp > expiresAt) revert CheckoutExpired();
        if (settledCheckouts[checkoutId]) revert CheckoutAlreadySettled();

        bytes32 digest = getCheckoutDigest(
            checkoutId,
            merchantId,
            agent,
            token,
            amount,
            treasury,
            expiresAt,
            metadataHash
        );
        if (_recover(digest, gatewaySignature) != gatewaySigner) {
            revert InvalidGatewaySignature();
        }

        uint256 attemptedSpend = spentByAgent[agent] + amount;
        uint256 limit = spendingLimits[agent];
        if (attemptedSpend > limit) {
            revert SpendingLimitExceeded(limit, attemptedSpend);
        }

        settledCheckouts[checkoutId] = true;
        spentByAgent[agent] = attemptedSpend;

        if (!IERC20(token).transferFrom(agent, treasury, amount)) {
            revert TokenTransferFailed();
        }

        emit CheckoutSettled(
            checkoutId,
            merchantId,
            agent,
            token,
            amount,
            treasury,
            metadataHash
        );
    }

    function setGatewaySigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAddress();
        address oldSigner = gatewaySigner;
        gatewaySigner = newSigner;
        emit GatewaySignerUpdated(oldSigner, newSigner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setSpendingLimit(address agent, uint256 limit) external onlyOwner {
        if (agent == address(0)) revert InvalidAddress();
        spendingLimits[agent] = limit;
        emit SpendingLimitUpdated(agent, limit);
    }

    function isWithinSpendingLimit(address agent, uint256 amount)
        external
        view
        returns (bool)
    {
        return spentByAgent[agent] + amount <= spendingLimits[agent];
    }

    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == deploymentChainId) return cachedDomainSeparator;
        return _buildDomainSeparator();
    }

    function getCheckoutDigest(
        bytes32 checkoutId,
        bytes32 merchantId,
        address agent,
        address token,
        uint256 amount,
        address treasury,
        uint256 expiresAt,
        bytes32 metadataHash
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CHECKOUT_TYPEHASH,
                checkoutId,
                merchantId,
                agent,
                token,
                amount,
                treasury,
                expiresAt,
                metadataHash
            )
        );

        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(), structHash)
        );
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    function _recover(bytes32 digest, bytes memory signature)
        private
        pure
        returns (address)
    {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        if (uint256(s) > SECP256K1_HALF_ORDER) return address(0);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }
}
