const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { getArtifact } = require("./compile");
const { loadEnv } = require("./env");

loadEnv();

// HashKey Chain Mainnet constants. Addresses are stored lowercase and
// normalized through ethers.getAddress() so comparisons are checksum-safe.
const MAINNET_CHAIN_ID = 177n;
const DEFAULT_RPC_URL = "https://mainnet.hsk.xyz";
const DEFAULT_EXPLORER_BASE_URL = "https://hsk.blockscout.com";
const DEPLOYMENT_FILE = path.resolve(process.cwd(), "deployments/hashkey-mainnet.json");

const EXPECTED_DEPLOYER = ethers.getAddress(
  "0xe374f6ee3380492a0a0fab06841037685bc50055"
);
const EXPECTED_GATEWAY_SIGNER = ethers.getAddress(
  "0x56a19db692f9fb9b0ec0c1f5b4497b5ba11a9609"
);
const EXPECTED_DEMO_AGENT = ethers.getAddress(
  "0x3e263b59c766ba7340108c6ffac42d07002fa99b"
);
const MERCHANT_TREASURY = ethers.getAddress(
  "0x0bbe314e75e36b9b9e875a70ce93d6f0ff0b5563"
);
const DEFAULT_USDC_ADDRESS = ethers.getAddress(
  "0x054ed45810dbbab8b27668922d110669c9d88d0a"
);

// Minimal ERC-20 read/approve ABI. The MockERC20 artifact is intentionally
// NOT used on mainnet.
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

function fail(message) {
  throw new Error(message);
}

function required(name, value) {
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

// Builds a wallet without ever letting the raw key leak into error output.
function walletFromKey(envName, privateKey) {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    fail(`${envName} is not a valid 32-byte hex private key (value not shown).`);
  }
  try {
    return new ethers.Wallet(normalized);
  } catch (_) {
    fail(`${envName} could not be parsed as a private key (value not shown).`);
  }
}

function assertDerivedAddress(label, wallet, expected) {
  if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
    fail(
      `${label} private key does not derive the expected address.\n` +
        `  expected: ${expected}\n` +
        `  derived:  ${wallet.address}`
    );
  }
}

function assertNonZeroAddress(label, address) {
  let normalized;
  try {
    normalized = ethers.getAddress(address);
  } catch (_) {
    fail(`${label} is not a valid EVM address: ${address}`);
  }
  if (normalized === ethers.ZeroAddress) fail(`${label} must not be the zero address.`);
  return normalized;
}

function parsePositiveTokenUnits(name, rawValue, decimals) {
  const value = String(rawValue).trim();
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    fail(`${name} must be a positive decimal number, got: ${value}`);
  }
  return ethers.parseUnits(value, decimals);
}

async function main() {
  const force = process.argv.includes("--force");

  if (process.env.DEPLOY_MOCK_TOKEN === "true") {
    fail(
      "DEPLOY_MOCK_TOKEN=true is not allowed on HashKey mainnet. " +
        "Mainnet must use the real bridged USDC token."
    );
  }

  const rpcUrl = process.env.HASHKEY_MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const configuredChainId = BigInt(process.env.HASHKEY_MAINNET_CHAIN_ID || "177");
  if (configuredChainId !== MAINNET_CHAIN_ID) {
    fail(
      `HASHKEY_MAINNET_CHAIN_ID must be 177 for HashKey mainnet, got ${configuredChainId}.`
    );
  }

  const deployerWalletBase = walletFromKey(
    "HASHKEY_MAINNET_DEPLOYER_PRIVATE_KEY",
    required(
      "HASHKEY_MAINNET_DEPLOYER_PRIVATE_KEY",
      process.env.HASHKEY_MAINNET_DEPLOYER_PRIVATE_KEY
    )
  );
  const gatewaySignerWallet = walletFromKey(
    "GATEWAY_SIGNER_PRIVATE_KEY",
    required("GATEWAY_SIGNER_PRIVATE_KEY", process.env.GATEWAY_SIGNER_PRIVATE_KEY)
  );
  const demoAgentWallet = walletFromKey(
    "DEMO_AGENT_PRIVATE_KEY",
    required("DEMO_AGENT_PRIVATE_KEY", process.env.DEMO_AGENT_PRIVATE_KEY)
  );

  assertDerivedAddress("Deployer", deployerWalletBase, EXPECTED_DEPLOYER);
  assertDerivedAddress("Gateway Signer", gatewaySignerWallet, EXPECTED_GATEWAY_SIGNER);
  assertDerivedAddress("Demo Agent", demoAgentWallet, EXPECTED_DEMO_AGENT);

  assertNonZeroAddress("Deployer", EXPECTED_DEPLOYER);
  assertNonZeroAddress("Gateway Signer", EXPECTED_GATEWAY_SIGNER);
  assertNonZeroAddress("Demo Agent", EXPECTED_DEMO_AGENT);
  assertNonZeroAddress("Merchant Treasury", MERCHANT_TREASURY);

  const tokenAddress = assertNonZeroAddress(
    "TOKEN_ADDRESS",
    process.env.TOKEN_ADDRESS || DEFAULT_USDC_ADDRESS
  );

  if (fs.existsSync(DEPLOYMENT_FILE) && !force) {
    fail(
      `${DEPLOYMENT_FILE} already exists. Refusing to redeploy and overwrite it. ` +
        "Pass --force only if you intend to replace the recorded mainnet deployment."
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== MAINNET_CHAIN_ID) {
    fail(
      `Connected chainId ${network.chainId} does not match HashKey mainnet (177). ` +
        `Check HASHKEY_MAINNET_RPC_URL (${rpcUrl}).`
    );
  }

  // --- Read-only pre-deploy checks -----------------------------------------
  const tokenCode = await provider.getCode(tokenAddress);
  if (!tokenCode || tokenCode === "0x") {
    fail(`No bytecode found at TOKEN_ADDRESS ${tokenAddress} on chainId 177.`);
  }

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const tokenDecimals = Number(await token.decimals());
  if (tokenDecimals !== 6) {
    fail(`Token decimals must be 6 for USDC, got ${tokenDecimals}.`);
  }
  let tokenSymbol = process.env.TOKEN_SYMBOL || "USDC";
  try {
    tokenSymbol = await token.symbol();
  } catch (_) {
    console.warn("Warning: token symbol() could not be read; using configured symbol.");
  }

  const deployer = new ethers.NonceManager(deployerWalletBase.connect(provider));
  const deployerBalance = await provider.getBalance(EXPECTED_DEPLOYER);
  console.log(`Deployer: ${EXPECTED_DEPLOYER}`);
  console.log(`Deployer HSK balance: ${ethers.formatEther(deployerBalance)}`);
  if (deployerBalance <= 0n) {
    fail("Deployer HSK balance is zero. Fund the deployer before deploying.");
  }

  const spendingLimit = parsePositiveTokenUnits(
    "SPENDING_LIMIT_TOKEN_UNITS",
    process.env.SPENDING_LIMIT_TOKEN_UNITS || "1",
    tokenDecimals
  );

  // --- Deploy SettlementGateway --------------------------------------------
  console.log("Deploying SettlementGateway to HashKey Chain Mainnet (chainId 177)...");
  const settlementArtifact = getArtifact("SettlementGateway");
  const SettlementFactory = new ethers.ContractFactory(
    settlementArtifact.abi,
    settlementArtifact.bytecode,
    deployer
  );
  const settlement = await SettlementFactory.deploy(
    EXPECTED_DEPLOYER,
    EXPECTED_GATEWAY_SIGNER
  );
  await settlement.waitForDeployment();
  const settlementAddress = ethers.getAddress(await settlement.getAddress());
  const deployTxHash = settlement.deploymentTransaction().hash;
  console.log(`SettlementGateway deployed at ${settlementAddress}`);
  console.log(`Deploy tx: ${deployTxHash}`);

  // --- setSpendingLimit ------------------------------------------------------
  console.log(
    `Setting spending limit for demo agent ${EXPECTED_DEMO_AGENT}: ` +
      `${ethers.formatUnits(spendingLimit, tokenDecimals)} ${tokenSymbol}`
  );
  const setLimitTx = await settlement.setSpendingLimit(
    EXPECTED_DEMO_AGENT,
    spendingLimit
  );
  await setLimitTx.wait();
  console.log(`setSpendingLimit tx: ${setLimitTx.hash}`);

  // --- Optional bounded agent approve (never unlimited) ----------------------
  let approveTxHash = "";
  if (process.env.AUTO_APPROVE === "true") {
    const approvalAmount = parsePositiveTokenUnits(
      "APPROVAL_TOKEN_UNITS",
      process.env.APPROVAL_TOKEN_UNITS || "1",
      tokenDecimals
    );

    const agentHskBalance = await provider.getBalance(EXPECTED_DEMO_AGENT);
    if (agentHskBalance <= 0n) {
      fail("AUTO_APPROVE: demo agent has no HSK for approve gas.");
    }
    const agentUsdcBalance = await token.balanceOf(EXPECTED_DEMO_AGENT);
    if (agentUsdcBalance < approvalAmount) {
      fail(
        `AUTO_APPROVE: demo agent USDC balance ` +
          `${ethers.formatUnits(agentUsdcBalance, tokenDecimals)} is below the ` +
          `requested approval ${ethers.formatUnits(approvalAmount, tokenDecimals)}.`
      );
    }

    const currentAllowance = await token.allowance(
      EXPECTED_DEMO_AGENT,
      settlementAddress
    );
    if (currentAllowance >= approvalAmount) {
      console.log(
        `AUTO_APPROVE: existing allowance ` +
          `${ethers.formatUnits(currentAllowance, tokenDecimals)} ${tokenSymbol} ` +
          "already covers the requested amount; skipping approve."
      );
    } else {
      const agent = new ethers.NonceManager(demoAgentWallet.connect(provider));
      const agentToken = token.connect(agent);
      const approveTx = await agentToken.approve(settlementAddress, approvalAmount);
      await approveTx.wait();
      approveTxHash = approveTx.hash;
      console.log(
        `Approved ${ethers.formatUnits(approvalAmount, tokenDecimals)} ${tokenSymbol} ` +
          `for SettlementGateway. Approve tx: ${approveTxHash}`
      );
    }
  } else {
    console.log("AUTO_APPROVE is not enabled; skipping agent USDC approve.");
  }

  // --- Deployment record (only written after a real, confirmed deployment) ---
  const deployment = {
    network: "HashKey Chain Mainnet",
    chainId: Number(network.chainId),
    contractName: "SettlementGateway",
    contractAddress: settlementAddress,
    deployTxHash,
    explorerBaseUrl: process.env.EXPLORER_BASE_URL || DEFAULT_EXPLORER_BASE_URL,
    deployedAt: new Date().toISOString(),
    gatewaySigner: EXPECTED_GATEWAY_SIGNER,
    demoAgent: EXPECTED_DEMO_AGENT,
    merchantTreasury: MERCHANT_TREASURY,
    token: {
      symbol: tokenSymbol,
      decimals: tokenDecimals,
      address: tokenAddress,
      mock: false,
    },
    tokens: {
      [tokenSymbol]: {
        symbol: tokenSymbol,
        decimals: tokenDecimals,
        address: tokenAddress,
        mock: false,
      },
    },
    setupTxHashes: {
      setSpendingLimit: setLimitTx.hash,
      approve: approveTxHash || undefined,
    },
    notes:
      "HashKey Chain Mainnet deployment using bridged USDC. No mock tokens are deployed or minted on mainnet.",
  };

  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
