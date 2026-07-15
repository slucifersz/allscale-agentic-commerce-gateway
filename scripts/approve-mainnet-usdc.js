const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { loadEnv } = require("./env");

loadEnv();

// Approves a bounded amount of USDC.e for the ALREADY-DEPLOYED mainnet
// SettlementGateway. This script never deploys anything and never uses
// unlimited (MaxUint256) approvals.
//
// Usage:
//   node scripts/approve-mainnet-usdc.js --check-only   # read-only, no tx
//   node scripts/approve-mainnet-usdc.js                # sends the approve tx

const MAINNET_CHAIN_ID = 177n;
const DEFAULT_RPC_URL = "https://mainnet.hsk.xyz";
const DEFAULT_EXPLORER_BASE_URL = "https://hsk.blockscout.com";
const DEPLOYMENT_FILE = path.resolve(process.cwd(), "deployments/hashkey-mainnet.json");

const EXPECTED_GATEWAY = ethers.getAddress(
  "0xdf0008d5c6ffb332a4a21a15018954e90f4fae01"
);
const EXPECTED_TOKEN = ethers.getAddress(
  "0x054ed45810dbbab8b27668922d110669c9d88d0a"
);
const EXPECTED_DEMO_AGENT = ethers.getAddress(
  "0x3e263b59c766ba7340108c6ffac42d07002fa99b"
);

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

function walletFromKey(envName, privateKey) {
  if (!privateKey) fail(`Missing required environment variable: ${envName}`);
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

async function main() {
  const checkOnly = process.argv.includes("--check-only");

  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    fail(`${DEPLOYMENT_FILE} not found. Mainnet must be deployed first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));

  const gatewayAddress = ethers.getAddress(deployment.contractAddress);
  if (gatewayAddress !== EXPECTED_GATEWAY) {
    fail(
      `Deployment contractAddress ${gatewayAddress} does not match the expected ` +
        `mainnet SettlementGateway ${EXPECTED_GATEWAY}.`
    );
  }
  const tokenAddress = ethers.getAddress(deployment.token?.address || "");
  if (tokenAddress !== EXPECTED_TOKEN) {
    fail(
      `Deployment token address ${tokenAddress} does not match the expected ` +
        `mainnet USDC.e ${EXPECTED_TOKEN}.`
    );
  }

  const agentWallet = walletFromKey(
    "DEMO_AGENT_PRIVATE_KEY",
    process.env.DEMO_AGENT_PRIVATE_KEY
  );
  if (agentWallet.address.toLowerCase() !== EXPECTED_DEMO_AGENT.toLowerCase()) {
    fail(
      "DEMO_AGENT_PRIVATE_KEY does not derive the expected demo agent address.\n" +
        `  expected: ${EXPECTED_DEMO_AGENT}\n` +
        `  derived:  ${agentWallet.address}`
    );
  }

  const rpcUrl = process.env.HASHKEY_MAINNET_RPC_URL || DEFAULT_RPC_URL;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== MAINNET_CHAIN_ID) {
    fail(`Connected chainId ${network.chainId} is not HashKey mainnet (177).`);
  }

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = Number(await token.decimals());
  if (decimals !== 6) fail(`USDC.e decimals must be 6, got ${decimals}.`);
  let symbol = "USDC.e";
  try {
    symbol = await token.symbol();
  } catch (_) {}

  const amountUnits = String(process.env.APPROVAL_TOKEN_UNITS || "1").trim();
  if (!/^\d+(\.\d+)?$/.test(amountUnits) || Number(amountUnits) <= 0) {
    fail(`APPROVAL_TOKEN_UNITS must be a positive decimal number, got: ${amountUnits}`);
  }
  const amount = ethers.parseUnits(amountUnits, decimals);

  const [hskBalance, usdcBalance, allowance] = await Promise.all([
    provider.getBalance(EXPECTED_DEMO_AGENT),
    token.balanceOf(EXPECTED_DEMO_AGENT),
    token.allowance(EXPECTED_DEMO_AGENT, gatewayAddress),
  ]);
  console.log(`Agent: ${EXPECTED_DEMO_AGENT}`);
  console.log(`Agent HSK balance: ${ethers.formatEther(hskBalance)}`);
  console.log(`Agent ${symbol} balance: ${ethers.formatUnits(usdcBalance, decimals)}`);
  console.log(
    `Current allowance for SettlementGateway: ${ethers.formatUnits(allowance, decimals)} ${symbol}`
  );
  console.log(`Requested approval: ${ethers.formatUnits(amount, decimals)} ${symbol}`);

  if (checkOnly) {
    console.log("--check-only: no transaction sent.");
    return;
  }

  if (hskBalance <= 0n) fail("Agent has no HSK for approve gas.");
  if (usdcBalance < amount) {
    fail(
      `Agent ${symbol} balance ${ethers.formatUnits(usdcBalance, decimals)} is below ` +
        `the requested approval ${ethers.formatUnits(amount, decimals)}.`
    );
  }
  if (allowance >= amount) {
    console.log("Existing allowance already covers the requested amount; nothing to do.");
    return;
  }

  const agent = new ethers.NonceManager(agentWallet.connect(provider));
  const approveTx = await token.connect(agent).approve(gatewayAddress, amount);
  console.log(`Approve tx sent: ${approveTx.hash}`);
  await approveTx.wait();

  const newAllowance = await token.allowance(EXPECTED_DEMO_AGENT, gatewayAddress);
  const explorerBase = (
    process.env.EXPLORER_BASE_URL || DEFAULT_EXPLORER_BASE_URL
  ).replace(/\/$/, "");
  console.log(`Approve confirmed: ${explorerBase}/tx/${approveTx.hash}`);
  console.log(
    `New allowance: ${ethers.formatUnits(newAllowance, decimals)} ${symbol}`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
