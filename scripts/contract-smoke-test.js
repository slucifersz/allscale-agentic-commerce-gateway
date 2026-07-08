const assert = require("assert");
const { ethers } = require("ethers");
const { getArtifact } = require("./compile");
const { loadEnv } = require("./env");

loadEnv();

const CHECKOUT_TYPES = {
  Checkout: [
    { name: "checkoutId", type: "bytes32" },
    { name: "merchantId", type: "bytes32" },
    { name: "agent", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "treasury", type: "address" },
    { name: "expiresAt", type: "uint256" },
    { name: "metadataHash", type: "bytes32" },
  ],
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function bytes32(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

async function deploy(factory, args = []) {
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function expectReject(operation, label) {
  try {
    await operation();
  } catch (_) {
    return;
  }
  throw new Error(`Expected rejection: ${label}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL || "http://127.0.0.1:8545"
  );
  const deployerWallet = new ethers.Wallet(required("DEPLOYER_PRIVATE_KEY"), provider);
  const deployer = new ethers.NonceManager(deployerWallet);
  const gatewaySigner = new ethers.Wallet(required("GATEWAY_SIGNER_PRIVATE_KEY"));
  const agentWallet = new ethers.Wallet(required("DEMO_AGENT_PRIVATE_KEY"), provider);
  const agent = new ethers.NonceManager(agentWallet);
  const treasury = process.env.DEMO_MERCHANT_TREASURY || deployerWallet.address;
  const network = await provider.getNetwork();

  const settlementArtifact = getArtifact("SettlementGateway");
  const tokenArtifact = getArtifact("MockERC20");
  const Settlement = new ethers.ContractFactory(
    settlementArtifact.abi,
    settlementArtifact.bytecode,
    deployer
  );
  const MockToken = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    deployer
  );

  const token = await deploy(MockToken, ["Mock USDC", "mUSDC", 6]);
  const gateway = await deploy(Settlement, [
    deployerWallet.address,
    gatewaySigner.address,
  ]);
  const tokenAddress = await token.getAddress();
  const gatewayAddress = await gateway.getAddress();

  const amount = 25_000_000n;
  await (await token.mint(agentWallet.address, 50_000_000n)).wait();
  await (await gateway.setSpendingLimit(agentWallet.address, amount)).wait();
  await (await token.connect(agent).approve(gatewayAddress, ethers.MaxUint256)).wait();

  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 900);
  const checkout = {
    checkoutId: bytes32(`smoke-${Date.now()}`),
    merchantId: bytes32("demo_merchant"),
    agent: agentWallet.address,
    token: tokenAddress,
    amount,
    treasury,
    expiresAt,
    metadataHash: bytes32("metadata"),
  };
  const domain = {
    name: "AllScale SettlementGateway",
    version: "1",
    chainId: Number(network.chainId),
    verifyingContract: gatewayAddress,
  };
  const signature = await gatewaySigner.signTypedData(
    domain,
    CHECKOUT_TYPES,
    checkout
  );

  await (
    await gateway.connect(agent).pay(
      checkout.checkoutId,
      checkout.merchantId,
      checkout.agent,
      checkout.token,
      checkout.amount,
      checkout.treasury,
      checkout.expiresAt,
      checkout.metadataHash,
      signature
    )
  ).wait();

  assert.equal((await token.balanceOf(treasury)).toString(), amount.toString());
  assert.equal(await gateway.settledCheckouts(checkout.checkoutId), true);

  await expectReject(
    async () => {
      const tx = await gateway.connect(agent).pay(
        checkout.checkoutId,
        checkout.merchantId,
        checkout.agent,
        checkout.token,
        checkout.amount,
        checkout.treasury,
        checkout.expiresAt,
        checkout.metadataHash,
        signature
      );
      await tx.wait();
    },
    "replay"
  );

  const second = {
    ...checkout,
    checkoutId: bytes32(`smoke-second-${Date.now()}`),
    amount: 1n,
  };
  const secondSig = await gatewaySigner.signTypedData(
    domain,
    CHECKOUT_TYPES,
    second
  );
  await expectReject(
    async () => {
      const tx = await gateway.connect(agent).pay(
        second.checkoutId,
        second.merchantId,
        second.agent,
        second.token,
        second.amount,
        second.treasury,
        second.expiresAt,
        second.metadataHash,
        secondSig
      );
      await tx.wait();
    },
    "spending limit"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        chainId: Number(network.chainId),
        settlement: gatewayAddress,
        token: tokenAddress,
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
