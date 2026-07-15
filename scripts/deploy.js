const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { getArtifact } = require("./compile");
const { loadEnv } = require("./env");

loadEnv();

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function privateKeyToAddress(privateKey) {
  return privateKey ? new ethers.Wallet(privateKey).address : "";
}

function deploymentFileFor(networkName) {
  if (networkName === "hashkey-testnet") {
    return path.resolve(process.cwd(), "deployments/hashkey-testnet.json");
  }
  return path.resolve(process.cwd(), "deployments/local.json");
}

async function deployContract(factory, args) {
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const networkName = argValue("--network", "local");
  const isHashKey = networkName === "hashkey-testnet";

  const rpcUrl = isHashKey
    ? process.env.HASHKEY_TESTNET_RPC_URL || process.env.RPC_URL
    : process.env.RPC_URL || "http://127.0.0.1:8545";
  const deployerPrivateKey = isHashKey
    ? process.env.HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY ||
      process.env.DEPLOYER_PRIVATE_KEY
    : process.env.DEPLOYER_PRIVATE_KEY;

  required(isHashKey ? "HASHKEY_TESTNET_RPC_URL" : "RPC_URL", rpcUrl);
  required(
    isHashKey ? "HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY",
    deployerPrivateKey
  );

  const gatewaySignerAddress =
    process.env.GATEWAY_SIGNER_ADDRESS ||
    privateKeyToAddress(process.env.GATEWAY_SIGNER_PRIVATE_KEY);
  const demoAgentAddress =
    process.env.DEMO_AGENT_ADDRESS ||
    privateKeyToAddress(process.env.DEMO_AGENT_PRIVATE_KEY);

  required("GATEWAY_SIGNER_ADDRESS or GATEWAY_SIGNER_PRIVATE_KEY", gatewaySignerAddress);
  required("DEMO_AGENT_ADDRESS or DEMO_AGENT_PRIVATE_KEY", demoAgentAddress);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);
  const deployer = new ethers.NonceManager(deployerWallet);
  const network = await provider.getNetwork();
  const expectedChainId = BigInt(
    isHashKey
      ? process.env.HASHKEY_TESTNET_CHAIN_ID || "133"
      : process.env.CHAIN_ID || network.chainId.toString()
  );
  if (network.chainId !== expectedChainId) {
    throw new Error(
      `Connected chainId ${network.chainId} does not match expected ${expectedChainId}`
    );
  }
  if (network.chainId === 177n) {
    throw new Error(
      "Refusing to run the local/testnet deploy script on HashKey mainnet (chainId 177). Use `npm run deploy:hashkey-mainnet` instead."
    );
  }

  const settlementArtifact = getArtifact("SettlementGateway");
  const erc20Artifact = getArtifact("MockERC20");

  const tokenDecimals = Number(process.env.TOKEN_DECIMALS || "6");
  const providedTokenAddress = process.env.TOKEN_ADDRESS || "";
  const shouldDeployMockToken =
    !providedTokenAddress || process.env.DEPLOY_MOCK_TOKEN === "true";

  const SettlementFactory = new ethers.ContractFactory(
    settlementArtifact.abi,
    settlementArtifact.bytecode,
    deployer
  );
  const MockTokenFactory = new ethers.ContractFactory(
    erc20Artifact.abi,
    erc20Artifact.bytecode,
    deployer
  );

  let token;
  let tokenDeployTxHash = "";
  let tokenIsMock = false;
  if (shouldDeployMockToken) {
    token = await deployContract(MockTokenFactory, [
      process.env.TOKEN_NAME || "Mock USDC",
      process.env.TOKEN_SYMBOL || "mUSDC",
      tokenDecimals,
    ]);
    tokenDeployTxHash = token.deploymentTransaction().hash;
    tokenIsMock = true;
  } else {
    token = new ethers.Contract(providedTokenAddress, erc20Artifact.abi, deployer);
  }

  const settlement = await deployContract(SettlementFactory, [
    deployerWallet.address,
    gatewaySignerAddress,
  ]);

  const settlementAddress = await settlement.getAddress();
  const tokenAddress = await token.getAddress();
  const treasury =
    process.env.DEMO_MERCHANT_TREASURY ||
    process.env.MERCHANT_TREASURY ||
    deployerWallet.address;

  const spendingLimitUnits = process.env.SPENDING_LIMIT_TOKEN_UNITS || "1000";
  const spendingLimit = ethers.parseUnits(spendingLimitUnits, tokenDecimals);
  const setLimitTx = await settlement.setSpendingLimit(
    demoAgentAddress,
    spendingLimit
  );
  await setLimitTx.wait();

  let mintTxHash = "";
  let approveTxHash = "";
  if (tokenIsMock) {
    const mintAmount = ethers.parseUnits(
      process.env.DEMO_AGENT_MINT_TOKEN_UNITS || "1000",
      tokenDecimals
    );
    const mintTx = await token.mint(demoAgentAddress, mintAmount);
    await mintTx.wait();
    mintTxHash = mintTx.hash;
  }

  if (process.env.DEMO_AGENT_PRIVATE_KEY) {
    const agentWallet = new ethers.Wallet(process.env.DEMO_AGENT_PRIVATE_KEY, provider);
    const agentToken = token.connect(agentWallet);
    const approveTx = await agentToken.approve(settlementAddress, ethers.MaxUint256);
    await approveTx.wait();
    approveTxHash = approveTx.hash;
  }

  const deployment = {
    network: isHashKey ? "HashKey Chain Testnet" : "Local Anvil",
    chainId: Number(network.chainId),
    contractName: "SettlementGateway",
    contractAddress: settlementAddress,
    deployTxHash: settlement.deploymentTransaction().hash,
    explorerBaseUrl: process.env.EXPLORER_BASE_URL || "_TBD",
    deployedAt: new Date().toISOString(),
    gatewaySigner: gatewaySignerAddress,
    demoAgent: demoAgentAddress,
    merchantTreasury: treasury,
    token: {
      symbol: process.env.TOKEN_SYMBOL || (tokenIsMock ? "mUSDC" : "USDC"),
      decimals: tokenDecimals,
      address: tokenAddress,
      mock: tokenIsMock,
      deployTxHash: tokenDeployTxHash || undefined,
    },
    setupTxHashes: {
      setSpendingLimit: setLimitTx.hash,
      mint: mintTxHash || undefined,
      approve: approveTxHash || undefined,
    },
    notes: tokenIsMock
      ? "MVP deployment uses a mock ERC-20 token. Replace with real HashKey testnet token configuration before presenting as stablecoin settlement."
      : "MVP settlement gateway deployment using externally configured ERC-20 token.",
  };

  const outputFile = deploymentFileFor(networkName);
  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
