const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DemoStateStore } = require("../server/state-store");

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "allscale-state-store-")
);
const stateFile = path.join(temporaryDirectory, "state", "demo-state.json");
const checkoutSessionId = "demo_checkout";
const transactionHash = `0x${"ab".repeat(32)}`;
const checkoutRecord = {
  canonicalCheckout: { amount: "4900" },
  checkout: { id: checkoutSessionId, status: "ready_for_payment" },
};
const order = {
  id: "ord_checkout",
  checkoutSessionId,
  transactionHash,
  status: "created",
};

try {
  const firstProcess = new DemoStateStore(stateFile);
  assert.equal(firstProcess.persistent, true);
  firstProcess.putCheckout(checkoutSessionId, checkoutRecord);
  const completed = firstProcess.completeOrder(
    checkoutSessionId,
    transactionHash,
    order
  );
  assert.equal(completed.checkout.checkout.status, "paid");

  const restartedProcess = new DemoStateStore(stateFile);
  assert.equal(
    restartedProcess.getCheckout(checkoutSessionId).checkout.status,
    "paid"
  );
  assert.deepEqual(restartedProcess.getOrder(order.id).order, order);
  assert.equal(restartedProcess.hasUsedTransaction(transactionHash), true);
  assert.throws(
    () =>
      restartedProcess.completeOrder(
        checkoutSessionId,
        transactionHash.toUpperCase().replace("0X", "0x"),
        { ...order, id: "ord_duplicate" }
      ),
    /transactionHash was already used/
  );

  const memoryStore = new DemoStateStore();
  assert.equal(memoryStore.persistent, false);
  memoryStore.putCheckout(checkoutSessionId, checkoutRecord);
  assert.equal(memoryStore.getCheckout(checkoutSessionId).checkout.status, "ready_for_payment");

  console.log("Demo state persistence checks passed");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
