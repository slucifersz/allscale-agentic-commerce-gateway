const assert = require("assert/strict");
const {
  AGENT_PROTOCOLS,
  CHECKOUT_TYPES,
  parseCanonicalCheckout,
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
