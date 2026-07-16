const assert = require("assert/strict");
const { ethers } = require("ethers");
const {
  AGENT_PROTOCOLS,
  CHECKOUT_TYPES,
  parseCanonicalCheckout,
  settlementArgumentsFromCheckout,
  settlementRequestFromCheckout,
} = require("../shared/canonical-checkout");

const input = {
  protocol: "ACP",
  checkoutId: `0x${"11".repeat(32)}`,
  merchantId: `0x${"22".repeat(32)}`,
  agent: `0x${"33".repeat(20)}`,
  token: `0x${"44".repeat(20)}`,
  amount: 4900n,
  treasury: `0x${"55".repeat(20)}`,
  expiresAt: 1_900_000_000,
  metadataHash: `0x${"66".repeat(32)}`,
  ignored: true,
};

const checkout = parseCanonicalCheckout(input);
assert.equal(checkout.protocol, "acp");
assert.equal(checkout.amount, "4900");
assert.equal(checkout.expiresAt, input.expiresAt);
assert.equal("ignored" in checkout, false);
assert(Object.isFrozen(checkout));
assert.deepEqual(AGENT_PROTOCOLS, ["x402", "acp", "ap2", "mpp"]);
assert.deepEqual(
  CHECKOUT_TYPES.Checkout.map(({ name }) => name),
  [
    "checkoutId",
    "merchantId",
    "agent",
    "token",
    "amount",
    "treasury",
    "expiresAt",
    "metadataHash",
  ]
);

const request = settlementRequestFromCheckout(checkout);
assert.equal("protocol" in request, false);
assert.deepEqual(
  Object.keys(request),
  CHECKOUT_TYPES.Checkout.map(({ name }) => name)
);
const signature = `0x${"77".repeat(65)}`;
const settlementArguments = settlementArgumentsFromCheckout(checkout, signature);
assert.deepEqual(
  settlementArguments,
  [...Object.values(request), signature]
);

const domain = {
  name: "AllScale SettlementGateway",
  version: "1",
  chainId: 177,
  verifyingContract: `0x${"88".repeat(20)}`,
};
assert.match(
  ethers.TypedDataEncoder.hash(domain, CHECKOUT_TYPES, request),
  /^0x[0-9a-f]{64}$/
);

const iface = new ethers.Interface([
  "function pay(bytes32 checkoutId, bytes32 merchantId, address agent, address token, uint256 amount, address treasury, uint256 expiresAt, bytes32 metadataHash, bytes gatewaySignature)",
]);
const calldata = iface.encodeFunctionData("pay", settlementArguments);
const decoded = iface.decodeFunctionData("pay", calldata);
assert.deepEqual(
  CHECKOUT_TYPES.Checkout.map(({ name }) => decoded[name].toString()),
  CHECKOUT_TYPES.Checkout.map(({ name }) => request[name].toString())
);
assert.equal(decoded.gatewaySignature, signature);

assert.throws(
  () => parseCanonicalCheckout({ ...input, checkoutId: "chk_demo" }),
  /checkoutId is invalid/
);
assert.throws(
  () => parseCanonicalCheckout({ ...input, amount: "-1" }),
  /amount must be a uint256/
);
assert.throws(
  () => parseCanonicalCheckout({ ...input, expiresAt: "not-a-time" }),
  /expiresAt must be a non-negative Unix timestamp/
);

console.log("CanonicalCheckout runtime schema checks passed");
