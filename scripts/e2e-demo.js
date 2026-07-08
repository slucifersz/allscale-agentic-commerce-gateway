const baseUrl = (process.env.DEMO_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = text;
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return payload;
}

async function main() {
  const config = await request("/demo/config");
  if (!config.ready) throw new Error("MVP API is not ready");

  const catalog = await request("/demo/catalog");
  if (!catalog.items || catalog.items.length === 0) {
    throw new Error("Catalog is empty");
  }

  const checkout = await request("/demo/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol: "acp",
      productId: catalog.items[0].id,
      tokenSymbol:
        process.env.TOKEN_SYMBOL ||
        config.tokens?.[0]?.symbol ||
        config.tokenSymbol,
      amountMinor: catalog.items[0].priceAmount,
    }),
  });

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
