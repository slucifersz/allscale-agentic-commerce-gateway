/**
 * Runtime definition for the normalized checkout shared by the demo API and
 * protocol-router types. Keep the settlement fields aligned with
 * SettlementGateway.CHECKOUT_TYPEHASH.
 */

const AGENT_PROTOCOLS = Object.freeze(["x402", "acp", "ap2", "mpp"]);

const SETTLEMENT_CHECKOUT_FIELDS = Object.freeze([
  Object.freeze({ name: "checkoutId", type: "bytes32" }),
  Object.freeze({ name: "merchantId", type: "bytes32" }),
  Object.freeze({ name: "agent", type: "address" }),
  Object.freeze({ name: "token", type: "address" }),
  Object.freeze({ name: "amount", type: "uint256" }),
  Object.freeze({ name: "treasury", type: "address" }),
  Object.freeze({ name: "expiresAt", type: "uint256" }),
  Object.freeze({ name: "metadataHash", type: "bytes32" }),
]);

const CHECKOUT_TYPES = Object.freeze({
  Checkout: SETTLEMENT_CHECKOUT_FIELDS,
});

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;

function requireString(value, fieldName, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`CanonicalCheckout.${fieldName} is invalid`);
  }
  return value;
}

function normalizeAmount(value) {
  const amount = typeof value === "bigint" ? value.toString() : String(value);
  if (!UINT_PATTERN.test(amount)) {
    throw new TypeError("CanonicalCheckout.amount must be a uint256 decimal string");
  }
  return amount;
}

function normalizeExpiresAt(value) {
  const expiresAt = Number(value);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new TypeError("CanonicalCheckout.expiresAt must be a non-negative Unix timestamp");
  }
  return expiresAt;
}

function normalizeProtocol(value) {
  const protocol = String(value).toLowerCase();
  if (!AGENT_PROTOCOLS.includes(protocol)) {
    throw new TypeError(`CanonicalCheckout.protocol is unsupported: ${value}`);
  }
  return protocol;
}

/**
 * Validate and normalize a checkout into its JSON-safe canonical form.
 * Unknown input properties are intentionally discarded.
 */
function parseCanonicalCheckout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("CanonicalCheckout must be an object");
  }

  return Object.freeze({
    protocol: normalizeProtocol(value.protocol),
    checkoutId: requireString(value.checkoutId, "checkoutId", BYTES32_PATTERN),
    merchantId: requireString(value.merchantId, "merchantId", BYTES32_PATTERN),
    agent: requireString(value.agent, "agent", ADDRESS_PATTERN),
    token: requireString(value.token, "token", ADDRESS_PATTERN),
    amount: normalizeAmount(value.amount),
    treasury: requireString(value.treasury, "treasury", ADDRESS_PATTERN),
    expiresAt: normalizeExpiresAt(value.expiresAt),
    metadataHash: requireString(value.metadataHash, "metadataHash", BYTES32_PATTERN),
  });
}

/** Return the exact ordered fields signed by EIP-712 and passed to pay(). */
function settlementRequestFromCheckout(value) {
  const checkout = parseCanonicalCheckout(value);
  return Object.freeze(
    Object.fromEntries(
      SETTLEMENT_CHECKOUT_FIELDS.map(({ name }) => [name, checkout[name]])
    )
  );
}

/** Return SettlementGateway.pay() arguments in ABI order. */
function settlementArgumentsFromCheckout(value, gatewaySignature) {
  if (
    typeof gatewaySignature !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(gatewaySignature)
  ) {
    throw new TypeError("gatewaySignature must be a hex string");
  }
  const request = settlementRequestFromCheckout(value);
  return Object.freeze([
    ...SETTLEMENT_CHECKOUT_FIELDS.map(({ name }) => request[name]),
    gatewaySignature,
  ]);
}

module.exports = {
  AGENT_PROTOCOLS,
  CHECKOUT_TYPES,
  SETTLEMENT_CHECKOUT_FIELDS,
  parseCanonicalCheckout,
  settlementArgumentsFromCheckout,
  settlementRequestFromCheckout,
};
