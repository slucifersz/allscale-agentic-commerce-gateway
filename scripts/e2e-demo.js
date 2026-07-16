const assert = require("assert/strict");

const baseUrl = (process.env.DEMO_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function requestRaw(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = text;
  }
  return { ok: res.ok, status: res.status, payload, text };
}

async function request(path, options = {}) {
  const result = await requestRaw(path, options);
  if (!result.ok) {
    throw new Error(`${path} failed (${result.status}): ${result.text}`);
  }
  return result.payload;
}

function startPayload(config, product, demoScenario) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol: "acp",
      productId: product.id,
      tokenSymbol:
        process.env.TOKEN_SYMBOL || config.tokens?.[0]?.symbol || config.tokenSymbol,
      amountMinor: product.priceAmount,
      demoScenario,
    }),
  };
}

async function assertBlocked(config, product, scenario, blockedBy) {
  const checkout = await request(
    "/demo/api/start",
    startPayload(config, product, scenario)
  );
  assert.equal(checkout.status, "BLOCKED");
  assert.equal(checkout.checkout.status, "blocked");
  assert.equal(checkout.verification.blockedBy, blockedBy);
  assert.equal(checkout.verification.simulated, true);
  assert.equal(checkout.verification.providerConnected, false);
  assert.equal(checkout.canComplete, false);
  assert.equal("paymentInstruction" in checkout, false);
  assert.equal("protocolPayload" in checkout, false);

  const completion = await requestRaw("/demo/api/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkoutSessionId: checkout.checkout.id }),
  });
  assert.equal(completion.status, 409);
  assert.match(completion.payload.message, /blocked|no signed payment instruction/i);
}

async function main() {
  const config = await request("/demo/config");
  if (!config.ready) throw new Error("MVP API is not ready");
  assert.equal(
    config.demoGateMode,
    "simulated",
    "E2E gate scenarios require DEMO_GATE_MODE=simulated on a non-mainnet chain"
  );

  const catalog = await request("/demo/catalog");
  if (!catalog.items || catalog.items.length === 0) {
    throw new Error("Catalog is empty");
  }

  await assertBlocked(config, catalog.items[0], "block_kyt", "kyt_aml");
  await assertBlocked(
    config,
    catalog.items[0],
    "block_authorization",
    "payer_authorization"
  );

  const checkout = await request(
    "/demo/api/start",
    startPayload(config, catalog.items[0], "pass")
  );

  assert.equal(checkout.status, "READY_FOR_PAYMENT");
  assert.equal(checkout.verification.decision, "allow");
  assert.equal(checkout.verification.simulated, true);
  assert.equal(checkout.verification.providerConnected, false);
  if (!checkout.paymentInstruction?.calldata) {
    throw new Error("Checkout did not include calldata");
  }

  const completion = await request("/demo/api/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      checkoutSessionId: checkout.checkout.id,
      protocol: checkout.checkout.protocol,
    }),
  });

  if (completion.order?.status !== "created") {
    throw new Error("Order was not created");
  }
  if (!completion.order.receipt?.event?.checkoutId) {
    throw new Error("Receipt verification event missing");
  }

  const orderRes = await fetch(`${baseUrl}${completion.order.permalinkUrl}`);
  if (!orderRes.ok) {
    throw new Error(`Order page failed (${orderRes.status})`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        chainId: config.chainId,
        contractAddress: config.contractAddress,
        verifiedScenarios: ["pass", "block_kyt", "block_authorization"],
        checkoutId: checkout.checkout.checkoutId,
        orderId: completion.order.id,
        txHash: completion.order.transactionHash,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
