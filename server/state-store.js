const fs = require("fs");
const path = require("path");

const STATE_VERSION = 1;

function emptyState() {
  return {
    version: STATE_VERSION,
    checkouts: {},
    orders: {},
    usedTxHashes: {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateLoadedState(value, filePath) {
  const valid =
    value &&
    value.version === STATE_VERSION &&
    value.checkouts &&
    typeof value.checkouts === "object" &&
    !Array.isArray(value.checkouts) &&
    value.orders &&
    typeof value.orders === "object" &&
    !Array.isArray(value.orders) &&
    value.usedTxHashes &&
    typeof value.usedTxHashes === "object" &&
    !Array.isArray(value.usedTxHashes);
  if (!valid) {
    throw new Error(`Demo state file is invalid or unsupported: ${filePath}`);
  }
  return value;
}

function loadState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return emptyState();
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return validateLoadedState(value, filePath);
}

function writeStateAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function normalizeTransactionHash(value) {
  const txHash = String(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    throw new TypeError("transactionHash must be a 32-byte hex string");
  }
  return txHash;
}

function stateError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

class DemoStateStore {
  constructor(filePath = null) {
    this.filePath = filePath;
    this.persistent = Boolean(filePath);
    this.state = loadState(filePath);
  }

  replaceState(nextState) {
    if (this.filePath) writeStateAtomically(this.filePath, nextState);
    this.state = nextState;
  }

  getCheckout(checkoutSessionId) {
    const value = this.state.checkouts[checkoutSessionId];
    return value ? clone(value) : null;
  }

  putCheckout(checkoutSessionId, checkoutRecord) {
    const nextState = clone(this.state);
    nextState.checkouts[checkoutSessionId] = clone(checkoutRecord);
    this.replaceState(nextState);
  }

  getOrder(orderId) {
    const value = this.state.orders[orderId];
    return value ? clone(value) : null;
  }

  hasUsedTransaction(transactionHash) {
    return Boolean(
      this.state.usedTxHashes[normalizeTransactionHash(transactionHash)]
    );
  }

  /**
   * Persist the order, paid checkout status and tx-hash claim as one snapshot.
   * A second in-process completion cannot reuse the same transaction hash.
   */
  completeOrder(checkoutSessionId, transactionHash, order) {
    const txHash = normalizeTransactionHash(transactionHash);
    if (this.state.usedTxHashes[txHash]) {
      throw stateError("transactionHash was already used", 409);
    }

    const storedCheckout = this.state.checkouts[checkoutSessionId];
    if (!storedCheckout) {
      throw stateError(`Unknown checkoutSessionId: ${checkoutSessionId}`, 404);
    }

    const checkoutRecord = clone(storedCheckout);
    checkoutRecord.checkout.status = "paid";
    const orderRecord = { order: clone(order), checkout: checkoutRecord };
    const nextState = clone(this.state);
    nextState.checkouts[checkoutSessionId] = checkoutRecord;
    nextState.orders[order.id] = orderRecord;
    nextState.usedTxHashes[txHash] = true;
    this.replaceState(nextState);
    return clone(orderRecord);
  }
}

function createDemoStateStore(rootDirectory, configuredPath = process.env.DEMO_STATE_FILE) {
  if (configuredPath === ":memory:") return new DemoStateStore();
  const filePath = path.resolve(
    rootDirectory,
    configuredPath || path.join(".data", "demo-state.json")
  );
  return new DemoStateStore(filePath);
}

module.exports = { DemoStateStore, createDemoStateStore };
