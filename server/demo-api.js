const fs = require("fs");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { ethers } = require("ethers");
const { getArtifact } = require("../scripts/compile");
const { loadEnv } = require("../scripts/env");
const { createDemoStateStore } = require("./state-store");
const {
  DEMO_GATE_SCENARIOS,
  disabledVerification,
  evaluateDemoGates,
  resolveDemoGateMode,
} = require("./demo-gates");
const {
  AGENT_PROTOCOLS,
  CHECKOUT_TYPES,
  parseCanonicalCheckout,
  settlementArgumentsFromCheckout,
  settlementRequestFromCheckout,
} = require("../shared/canonical-checkout");

loadEnv();

const PORT = Number(process.env.PORT || "8787");
const ROOT = process.cwd();
const FRONTEND_FILE = path.join(ROOT, "frontend", "index.html");
const SETTLEMENT_ABI = getArtifact("SettlementGateway").abi;
const stateStore = createDemoStateStore(ROOT);

const CATALOG = [
  {
    id: "hashkey-agent-pass",
    title: "Agent Pass",
    description: "A demo digital product sold through an agentic checkout.",
    priceAmount: "4900",
    currency: "USD",
    metadata: { fulfillment: "digital", protocol: "ACP" },
  },
  {
    id: "stablecoin-api-credit",
    title: "Stablecoin API Credit",
    description: "Usage credit for a paid API resource protected by x402/MPP.",
    priceAmount: "1200",
    currency: "USD",
    metadata: { fulfillment: "api", protocol: "x402" },
  },
  {
    id: "merchant-starter-kit",
    title: "Merchant Starter Kit",
    description: "A mock merchant onboarding bundle for the MVP demo.",
    priceAmount: "9900",
    currency: "USD",
    metadata: { fulfillment: "digital", protocol: "AP2" },
  },
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const MAINNET_CHAIN_ID = 177;
const MAINNET_DEPLOYMENT_FILE = "deployments/hashkey-mainnet.json";

function loadDeployment() {
  const explicit = process.env.DEPLOYMENT_FILE
    ? path.resolve(ROOT, process.env.DEPLOYMENT_FILE)
    : "";
  const localDeployment = path.join(ROOT, "deployments", "local.json");
  const hashKeyDeployment = path.join(ROOT, "deployments", "hashkey-testnet.json");
  const mainnetDeployment = path.join(ROOT, MAINNET_DEPLOYMENT_FILE);
  const configuredChainId = Number(process.env.CHAIN_ID || "0");
  // On mainnet, never fall back to testnet/local deployment records: the
  // EIP-712 domain must only ever reference the mainnet contract address.
  const preferred =
    configuredChainId === MAINNET_CHAIN_ID
      ? [mainnetDeployment]
      : configuredChainId === 133
        ? [hashKeyDeployment, localDeployment]
        : [localDeployment, hashKeyDeployment];
  const candidates = [explicit, ...preferred].filter(Boolean);

  for (const candidate of candidates) {
    const value = readJson(candidate);
    if (value && value.contractAddress && value.contractAddress !== "_TBD") {
      return { ...value, filePath: candidate };
    }
  }
  return null;
}

function deploymentTokens(deployment) {
  const tokens = {};
  if (deployment?.tokens && typeof deployment.tokens === "object") {
    for (const [symbol, token] of Object.entries(deployment.tokens)) {
      if (!token || !token.address || token.address === "_TBD") continue;
      tokens[symbol] = {
        symbol: token.symbol || symbol,
        decimals: Number(token.decimals || 6),
        address: token.address,
        mock: Boolean(token.mock),
      };
    }
  }
  if (deployment?.token?.address && deployment.token.address !== "_TBD") {
    const symbol = deployment.token.symbol || "mUSDC";
    tokens[symbol] = {
      symbol,
      decimals: Number(deployment.token.decimals || 6),
      address: deployment.token.address,
      mock: Boolean(deployment.token.mock),
    };
  }
  return tokens;
}

function appConfig(selectedTokenSymbol) {
  const deployment = loadDeployment();
  const chainId = Number(process.env.CHAIN_ID || deployment?.chainId || "31337");
  const mainnetDeploymentMissing =
    Number(process.env.CHAIN_ID || "0") === MAINNET_CHAIN_ID && !deployment;
  const tokens = deploymentTokens(deployment);
  if (process.env.TOKEN_ADDRESS) {
    const envSymbol = process.env.TOKEN_SYMBOL || selectedTokenSymbol || "mUSDC";
    tokens[envSymbol] = {
      symbol: envSymbol,
      decimals: Number(process.env.TOKEN_DECIMALS || "6"),
      address: process.env.TOKEN_ADDRESS,
      mock: process.env.TOKEN_IS_MOCK !== "false",
    };
  }
  const availableTokens = Object.values(tokens);
  const requestedToken =
    selectedTokenSymbol && tokens[selectedTokenSymbol]
      ? tokens[selectedTokenSymbol]
      : availableTokens[0] || {};
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const contractAddress = process.env.CONTRACT_ADDRESS || deployment?.contractAddress || "";
  const tokenAddress = requestedToken.address || "";
  const tokenDecimals = Number(requestedToken.decimals || "6");
  const tokenSymbol = requestedToken.symbol || selectedTokenSymbol || "mUSDC";
  const gatewaySignerPrivateKey = process.env.GATEWAY_SIGNER_PRIVATE_KEY || "";
  const demoAgentPrivateKey = process.env.DEMO_AGENT_PRIVATE_KEY || "";
  const demoAgentAddress =
    process.env.DEMO_AGENT_ADDRESS ||
    deployment?.demoAgent ||
    (demoAgentPrivateKey ? new ethers.Wallet(demoAgentPrivateKey).address : "");
  const merchantTreasury =
    process.env.DEMO_MERCHANT_TREASURY ||
    deployment?.merchantTreasury ||
    process.env.MERCHANT_TREASURY ||
    "";
  const explorerBaseUrl =
    process.env.EXPLORER_BASE_URL ||
    deployment?.explorerBaseUrl ||
    "";
  const demoGateMode = resolveDemoGateMode(chainId);

  return {
    deployment,
    mainnetDeploymentMissing,
    rpcUrl,
    chainId,
    contractAddress,
    tokens: availableTokens,
    tokenAddress,
    tokenDecimals,
    tokenSymbol,
    tokenIsMock: Boolean(requestedToken.mock),
    gatewaySignerPrivateKey,
    demoAgentPrivateKey,
    demoAgentAddress,
    merchantTreasury,
    explorerBaseUrl,
    demoGateMode,
    ready:
      Boolean(contractAddress) &&
      Boolean(tokenAddress) &&
      Boolean(gatewaySignerPrivateKey) &&
      Boolean(demoAgentAddress) &&
      Boolean(merchantTreasury),
    canAutoPay: Boolean(demoAgentPrivateKey),
  };
}

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function htmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function textResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request_body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function requireConfig(config) {
  if (config.mainnetDeploymentMissing) {
    const error = new Error(
      "HashKey Chain Mainnet is not deployed yet: " +
        `${MAINNET_DEPLOYMENT_FILE} was not found. Run ` +
        "`npm run deploy:hashkey-mainnet` to deploy, or set DEPLOYMENT_FILE " +
        "explicitly."
    );
    error.statusCode = 503;
    throw error;
  }
  if (!config.ready) {
    const missing = [];
    if (!config.contractAddress) missing.push("contractAddress");
    if (!config.tokenAddress) missing.push("tokenAddress");
    if (!config.gatewaySignerPrivateKey) missing.push("GATEWAY_SIGNER_PRIVATE_KEY");
    if (!config.demoAgentAddress) missing.push("DEMO_AGENT_ADDRESS or DEMO_AGENT_PRIVATE_KEY");
    if (!config.merchantTreasury) missing.push("DEMO_MERCHANT_TREASURY");
    const error = new Error(`MVP chain config is incomplete: ${missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }
}

function bytes32From(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function metadataHashFor(value) {
  return bytes32From(JSON.stringify(value));
}

function parseAmountMinor(amountMinor, decimals) {
  if (!/^\d+$/.test(String(amountMinor))) {
    throw Object.assign(new Error("amountMinor must be an integer string"), {
      statusCode: 400,
    });
  }
  const scale = decimals >= 2 ? 10n ** BigInt(decimals - 2) : 1n;
  return BigInt(amountMinor) * scale;
}

function findProduct(productId) {
  const product = CATALOG.find((item) => item.id === productId);
  if (!product) {
    throw Object.assign(new Error(`Unknown productId: ${productId}`), {
      statusCode: 400,
    });
  }
  return product;
}

function protocolPayload(protocol, checkout, paymentInstruction) {
  const lower = protocol.toLowerCase();
  if (lower === "x402") {
    return {
      status: 402,
      endpoint: "/x402/demo/resource",
      accepts: [
        {
          scheme: "exact",
          network: paymentInstruction.network,
          asset: paymentInstruction.tokenAddress,
          payTo: paymentInstruction.routerAddress,
          maxAmountRequired: paymentInstruction.request.amount,
          extra: {
            checkoutId: checkout.checkoutId,
            calldata: paymentInstruction.calldata,
          },
        },
      ],
    };
  }
  if (lower === "mpp") {
    return {
      endpoint: "/mpp/demo/charge",
      challenge: {
        type: "payment",
        network: paymentInstruction.network,
        method: "io.allscale.hashkey.stablecoin",
        router: paymentInstruction.routerAddress,
        calldata: paymentInstruction.calldata,
      },
    };
  }
  if (lower === "ap2") {
    return {
      endpoint: "/ap2/demo/mandates",
      mandate: {
        id: checkout.id,
        paymentTermsHash: checkout.checkoutId,
        network: paymentInstruction.network,
        paymentInstruction,
      },
    };
  }
  return {
    endpoint: "/acp/demo_merchant/checkout_sessions",
    paymentHandler: {
      id: "hashkey_stablecoin",
      name: "io.allscale.hashkey.stablecoin",
      requires_delegate_payment: false,
      psp: "allscale_hashkey",
      config: {
        network: paymentInstruction.network,
        router: paymentInstruction.routerAddress,
        token: paymentInstruction.tokenAddress,
        checkout_id: checkout.checkoutId,
      },
    },
  };
}

async function startCheckout(payload) {
  const config = appConfig(payload.tokenSymbol);
  requireConfig(config);

  const product = findProduct(payload.productId || CATALOG[0].id);
  const protocol = String(payload.protocol || "acp").toLowerCase();
  if (!AGENT_PROTOCOLS.includes(protocol)) {
    throw Object.assign(new Error(`Unsupported protocol: ${protocol}`), {
      statusCode: 400,
    });
  }

  const amountMinor = String(payload.amountMinor || product.priceAmount);
  const amount = parseAmountMinor(amountMinor, config.tokenDecimals);
  const id = `demo_${randomUUID()}`;
  const checkoutId = bytes32From(id);
  const merchant = {
    id: "demo_merchant",
    name: "HashKey Demo Merchant",
    treasury: config.merchantTreasury,
  };
  const merchantId = bytes32From(merchant.id);
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const lineItem = {
    id: product.id,
    title: product.title,
    quantity: 1,
    unitAmount: amountMinor,
    totalAmount: amountMinor,
    metadata: product.metadata,
  };
  const metadataHash = metadataHashFor({ product, protocol, amountMinor, id });

  const canonicalCheckout = parseCanonicalCheckout({
    protocol,
    checkoutId,
    merchantId,
    agent: config.demoAgentAddress,
    token: config.tokenAddress,
    amount,
    treasury: config.merchantTreasury,
    expiresAt,
    metadataHash,
  });

  if (config.demoGateMode === "disabled" && payload.demoScenario != null) {
    throw Object.assign(
      new Error(
        "demoScenario is unavailable because demo verification is disabled"
      ),
      { statusCode: 400 }
    );
  }
  const verification =
    config.demoGateMode === "simulated"
      ? evaluateDemoGates(String(payload.demoScenario || "pass"))
      : disabledVerification();

  const checkout = {
    id,
    status: verification.decision === "block" ? "blocked" : "ready_for_payment",
    protocol,
    checkoutId: canonicalCheckout.checkoutId,
    merchantCheckoutId: `demo_cart_${product.id}`,
    totalAmount: amountMinor,
    currency: "USD",
    tokenSymbol: config.tokenSymbol,
    tokenAddress: canonicalCheckout.token,
    tokenDecimals: config.tokenDecimals,
    expiresAt: new Date(canonicalCheckout.expiresAt * 1000).toISOString(),
    lineItems: [lineItem],
    agent: canonicalCheckout.agent,
    merchantId: canonicalCheckout.merchantId,
    metadataHash: canonicalCheckout.metadataHash,
  };

  if (verification.decision === "block") {
    const blockedResponse = {
      mode: "mvp-chain",
      status: "BLOCKED",
      merchant,
      canonicalCheckout,
      checkout,
      verification,
      canAutoPay: false,
      canComplete: false,
    };
    stateStore.putCheckout(id, blockedResponse);
    return blockedResponse;
  }

  const settlementRequest = settlementRequestFromCheckout(canonicalCheckout);
  const domain = {
    name: "AllScale SettlementGateway",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.contractAddress,
  };
  const gatewaySigner = new ethers.Wallet(config.gatewaySignerPrivateKey);
  const gatewaySignature = await gatewaySigner.signTypedData(
    domain,
    CHECKOUT_TYPES,
    settlementRequest
  );

  const iface = new ethers.Interface(SETTLEMENT_ABI);
  const calldata = iface.encodeFunctionData(
    "pay",
    settlementArgumentsFromCheckout(canonicalCheckout, gatewaySignature)
  );

  const paymentInstruction = {
    chainId: config.chainId,
    network: `eip155:${config.chainId}`,
    routerAddress: config.contractAddress,
    functionName: "pay",
    request: settlementRequest,
    gatewaySignature,
    calldata,
    tokenSymbol: checkout.tokenSymbol,
    tokenDecimals: config.tokenDecimals,
    tokenIsMock: config.tokenIsMock,
  };

  const response = {
    mode: "mvp-chain",
    status: "READY_FOR_PAYMENT",
    merchant,
    canonicalCheckout,
    checkout,
    verification,
    paymentInstruction,
    protocolPayload: protocolPayload(protocol, checkout, paymentInstruction),
    canAutoPay: config.canAutoPay,
    canComplete: true,
  };
  stateStore.putCheckout(id, response);
  return response;
}

async function submitPayment(checkoutRecord) {
  const config = appConfig();
  if (!config.demoAgentPrivateKey) {
    throw Object.assign(
      new Error("DEMO_AGENT_PRIVATE_KEY is required for API auto-payment"),
      { statusCode: 400 }
    );
  }
  if (
    Number(config.chainId) === MAINNET_CHAIN_ID &&
    process.env.ALLOW_MAINNET_AUTOPAY !== "true"
  ) {
    throw Object.assign(
      new Error(
        "Auto-payment is disabled on HashKey mainnet. Set ALLOW_MAINNET_AUTOPAY=true to enable it deliberately, or submit a transactionHash instead."
      ),
      { statusCode: 403 }
    );
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.demoAgentPrivateKey, provider);
  if (
    signer.address.toLowerCase() !==
    checkoutRecord.canonicalCheckout.agent.toLowerCase()
  ) {
    throw Object.assign(
      new Error("DEMO_AGENT_PRIVATE_KEY does not match the checkout agent"),
      { statusCode: 400 }
    );
  }
  const wallet = new ethers.NonceManager(signer);
  const tx = await wallet.sendTransaction({
    to: checkoutRecord.paymentInstruction.routerAddress,
    data: checkoutRecord.paymentInstruction.calldata,
  });
  await tx.wait();
  return tx.hash;
}

async function verifyReceipt(txHash, checkoutRecord) {
  const config = appConfig();
  requireConfig(config);
  const paymentInstruction = checkoutRecord.paymentInstruction;
  const expectedRequest = settlementRequestFromCheckout(
    checkoutRecord.canonicalCheckout
  );
  const expectedContract = paymentInstruction.routerAddress;
  const expectedChainId = Number(paymentInstruction.chainId);

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw Object.assign(new Error("transactionHash must be a 32-byte hex string"), {
      statusCode: 400,
    });
  }
  if (stateStore.hasUsedTransaction(txHash)) {
    throw Object.assign(new Error("transactionHash was already used"), {
      statusCode: 409,
    });
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChainId) {
    throw Object.assign(
      new Error(
        `RPC chainId ${network.chainId} does not match checkout ${expectedChainId}`
      ),
      { statusCode: 502 }
    );
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw Object.assign(new Error("transaction receipt not found"), {
      statusCode: 404,
    });
  }
  if (receipt.status !== 1) {
    throw Object.assign(new Error("transaction reverted"), { statusCode: 400 });
  }
  if (receipt.to?.toLowerCase() !== expectedContract.toLowerCase()) {
    throw Object.assign(new Error("transaction target is not SettlementGateway"), {
      statusCode: 400,
    });
  }

  const iface = new ethers.Interface(SETTLEMENT_ABI);
  let matchedEvent = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedContract.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "CheckoutSettled") {
        const args = parsed.args;
        const matches =
          args.checkoutId === expectedRequest.checkoutId &&
          args.merchantId === expectedRequest.merchantId &&
          args.agent.toLowerCase() === expectedRequest.agent.toLowerCase() &&
          args.token.toLowerCase() === expectedRequest.token.toLowerCase() &&
          args.amount.toString() === expectedRequest.amount &&
          args.treasury.toLowerCase() === expectedRequest.treasury.toLowerCase() &&
          args.metadataHash === expectedRequest.metadataHash;
        if (matches) {
          matchedEvent = {
            checkoutId: args.checkoutId,
            merchantId: args.merchantId,
            agent: args.agent,
            token: args.token,
            amount: args.amount.toString(),
            treasury: args.treasury,
            metadataHash: args.metadataHash,
          };
          break;
        }
      }
    } catch (_) {
      // Ignore unrelated logs.
    }
  }

  if (!matchedEvent) {
    throw Object.assign(
      new Error("receipt does not contain a matching CheckoutSettled event"),
      { statusCode: 400 }
    );
  }

  return {
    network: `eip155:${expectedChainId}`,
    chainId: expectedChainId,
    transactionHash: txHash,
    explorerUrl: config.explorerBaseUrl
      ? `${config.explorerBaseUrl.replace(/\/$/, "")}/tx/${txHash}`
      : "",
    event: matchedEvent,
  };
}

async function completeOrder(payload) {
  const checkoutSessionId = payload.checkoutSessionId;
  const checkoutRecord = stateStore.getCheckout(checkoutSessionId);
  if (!checkoutRecord) {
    throw Object.assign(new Error(`Unknown checkoutSessionId: ${checkoutSessionId}`), {
      statusCode: 404,
    });
  }

  if (
    checkoutRecord.checkout?.status !== "ready_for_payment" ||
    !checkoutRecord.paymentInstruction?.calldata ||
    !checkoutRecord.paymentInstruction?.gatewaySignature
  ) {
    throw Object.assign(
      new Error(
        "Checkout is blocked or has no signed payment instruction; settlement is not allowed"
      ),
      { statusCode: 409 }
    );
  }

  const txHash = payload.transactionHash || (await submitPayment(checkoutRecord));
  const receipt = await verifyReceipt(txHash, checkoutRecord);
  const orderId = `ord_${checkoutSessionId.slice(-12).replace(/[^a-zA-Z0-9]/g, "")}`;
  const order = {
    id: orderId,
    checkoutSessionId,
    status: "created",
    protocol: checkoutRecord.checkout.protocol,
    transactionHash: txHash,
    explorerUrl: receipt.explorerUrl,
    permalinkUrl: `/demo/orders/${orderId}`,
    receipt,
    createdAt: new Date().toISOString(),
  };
  const orderRecord = stateStore.completeOrder(
    checkoutSessionId,
    txHash,
    order
  );
  return { ok: true, order: orderRecord.order };
}

function orderPage(record) {
  const order = record.order;
  const checkout = record.checkout.checkout;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${order.id} - AllScale MVP Order</title>
  <style>
    body { margin: 0; background: #0c1118; color: #eef4ff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
    main { max-width: 860px; margin: 0 auto; padding: 32px 18px; }
    a { color: #8fc7ff; }
    .card { border: 1px solid #2d3848; background: #141b26; border-radius: 8px; padding: 18px; margin: 14px 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { white-space: pre-wrap; word-break: break-word; background: #090d13; border-radius: 8px; padding: 14px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>Order ${order.id}</h1>
    <div class="card">
      <p><strong>Status:</strong> ${order.status}</p>
      <p><strong>Checkout:</strong> ${checkout.id}</p>
      <p><strong>Protocol:</strong> ${order.protocol}</p>
      <p><strong>Tx:</strong> <code>${order.transactionHash}</code></p>
      ${
        order.explorerUrl
          ? `<p><a href="${order.explorerUrl}">View transaction</a></p>`
          : ""
      }
    </div>
    <div class="card">
      <h2>Receipt</h2>
      <pre>${escapeHtml(JSON.stringify(order.receipt, null, 2))}</pre>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return htmlResponse(res, 200, fs.readFileSync(FRONTEND_FILE, "utf8"));
  }

  if (req.method === "GET" && url.pathname === "/demo/catalog") {
    return jsonResponse(res, 200, { items: CATALOG });
  }

  if (req.method === "GET" && url.pathname === "/demo/config") {
    const config = appConfig();
    return jsonResponse(res, 200, {
      ready: config.ready,
      canAutoPay: config.canAutoPay,
      demoGateMode: config.demoGateMode,
      demoGateScenarios:
        config.demoGateMode === "simulated" ? DEMO_GATE_SCENARIOS : [],
      verificationDisclaimer:
        config.demoGateMode === "simulated"
          ? "SIMULATED DISPLAY ONLY: no request is sent to BlockSec or Primus."
          : "Verification gates are disabled; no live BlockSec or Primus integration exists.",
      chainId: config.chainId,
      mainnetDeploymentMissing: config.mainnetDeploymentMissing,
      ...(config.mainnetDeploymentMissing
        ? {
            notice:
              `HashKey Chain Mainnet is not deployed yet (${MAINNET_DEPLOYMENT_FILE} not found). ` +
              "Run `npm run deploy:hashkey-mainnet` to deploy.",
          }
        : {}),
      contractAddress: config.contractAddress || "_TBD",
      tokens: config.tokens,
      tokenAddress: config.tokenAddress || "_TBD",
      tokenSymbol: config.tokenSymbol,
      tokenIsMock: config.tokenIsMock,
      agent: config.demoAgentAddress || "_TBD",
      treasury: config.merchantTreasury || "_TBD",
      deploymentFile: config.deployment?.filePath || "",
      explorerBaseUrl: config.explorerBaseUrl || "",
      statePersistent: stateStore.persistent,
    });
  }

  if (req.method === "POST" && url.pathname === "/demo/api/start") {
    const payload = await readRequestJson(req);
    return jsonResponse(res, 200, await startCheckout(payload));
  }

  if (req.method === "POST" && url.pathname === "/demo/api/complete") {
    const payload = await readRequestJson(req);
    return jsonResponse(res, 200, await completeOrder(payload));
  }

  if (req.method === "GET" && url.pathname.startsWith("/demo/orders/")) {
    const orderId = decodeURIComponent(url.pathname.split("/").pop());
    const record = stateStore.getOrder(orderId);
    if (!record) return jsonResponse(res, 404, { error: "not_found" });
    return htmlResponse(res, 200, orderPage(record));
  }

  return jsonResponse(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    const statusCode = error.statusCode || 500;
    jsonResponse(res, statusCode, {
      error: statusCode >= 500 ? "internal_error" : "invalid_request",
      message: error.message,
    });
  });
});

server.listen(PORT, () => {
  const config = appConfig();
  console.log(`AllScale MVP demo API listening on http://127.0.0.1:${PORT}`);
  console.log(
    `chain=${config.chainId} contract=${config.contractAddress || "_TBD"} ready=${config.ready}`
  );
});
