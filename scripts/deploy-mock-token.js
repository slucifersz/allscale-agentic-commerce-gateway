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

function deploymentFileFor(networkName) {
  if (networkName === "hashkey-testnet") {
    return path.resolve(process.cwd(), "deployments/hashkey-testnet.json");
  }
  return path.resolve(process.cwd(), "deployments/local.json");
}

async function main() {
  const networkName = argValue("--network", "hashkey-testnet");
  const isHashKey = networkName === "hashkey-testnet";
  const outputFile = deploymentFileFor(networkName);
  const deployment = fs.existsSync(outputFile)
    ? JSON.parse(fs.readFileSync(outputFile, "utf8"))
    : {};

  const rpcUrl = isHashKey
    ? process.env.HASHKEY_TESTNET_RPC_URL || process.env.RPC_URL
    : process.env.RPC_URL || "http://127.0.0.1:8545";
  const deployerPrivateKey = isHashKey
    ? process.env.HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY ||
      process.env.DEPLOYER_PRIVATE_KEY
    : process.env.DEPLOYER_PRIVATE_KEY;
  const demoAgentPrivateKey = process.env.DEMO_AGENT_PRIVATE_KEY || "";
  const demoAgentAddress =
    process.env.DEMO_AGENT_ADDRESS ||
    deployment.demoAgent ||
    (demoAgentPrivateKey ? new ethers.Wallet(demoAgentPrivateKey).address : "");

  required(isHashKey ? "HASHKEY_TESTNET_RPC_URL" : "RPC_URL", rpcUrl);
  required(
    isHashKey ? "HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY",
    deployerPrivateKey
  );
  required("DEMO_AGENT_ADDRESS or DEMO_AGENT_PRIVATE_KEY", demoAgentAddress);
  required("deployment contractAddress", deployment.contractAddress);

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
      "Refusing to deploy mock tokens on HashKey mainnet (chainId 177). Mainnet uses real bridged USDC only."
    );
  }

  const tokenName = process.env.TOKEN_NAME || "Mock USDT";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "mUSDT";
  const tokenDecimals = Number(process.env.TOKEN_DECIMALS || "6");
  const tokenArtifact = getArtifact("MockERC20");
  const TokenFactory = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    deployer
  );
  const token = await TokenFactory.deploy(tokenName, tokenSymbol, tokenDecimals);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const mintAmount = ethers.parseUnits(
    process.env.DEMO_AGENT_MINT_TOKEN_UNITS || "1000",
    tokenDecimals
  );
  const mintTx = await token.mint(demoAgentAddress, mintAmount);
  await mintTx.wait();

  let approveTxHash = "";
  if (demoAgentPrivateKey) {
    const agent = new ethers.NonceManager(
      new ethers.Wallet(demoAgentPrivateKey, provider)
    );
    const approveTx = await token
      .connect(agent)
      .approve(deployment.contractAddress, ethers.MaxUint256);
    await approveTx.wait();
    approveTxHash = approveTx.hash;
  }

  const tokenRecord = {
    symbol: tokenSymbol,
    decimals: tokenDecimals,
    address: tokenAddress,
    mock: true,
    deployTxHash: token.deploymentTransaction().hash,
    mintTxHash: mintTx.hash,
    approveTxHash: approveTxHash || undefined,
  };

  deployment.tokens = {
    ...(deployment.tokens || {}),
  };
  if (deployment.token?.address && deployment.token.address !== "_TBD") {
    deployment.tokens[deployment.token.symbol || "mUSDC"] = deployment.token;
  }
  deployment.tokens[tokenSymbol] = tokenRecord;
  deployment.notes =
    "MVP deployment uses mock ERC-20 tokens. These are not official USDC/USDT contracts; replace with real token configuration before presenting as production stablecoin settlement.";

  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(JSON.stringify({ token: tokenRecord, deploymentFile: outputFile }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
