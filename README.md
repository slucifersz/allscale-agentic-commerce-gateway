# AllScale Agentic Commerce Gateway

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

A hackathon MVP for **HashKey Chain On-Chain Horizon**. The current repo now runs a local end-to-end checkout flow:

1. agent protocol request (`ACP` / `AP2` / `x402` / `MPP`)
2. canonical checkout generation
3. EIP-712 gateway signature over exact payment terms
4. `SettlementGateway.pay()` ERC-20 settlement
5. `CheckoutSettled` receipt verification
6. demo order creation

KYT / KYC providers are still **not live**. Gate 1 and Gate 2 remain mock/demo concerns; the MVP focus is the payment and receipt-verification loop.

## Current Status

| Component | Status |
|---|---|
| Frontend MVP console | implemented in `frontend/index.html` |
| Demo API | implemented in `server/demo-api.js` |
| Catalog / checkout / complete endpoints | implemented |
| Settlement contract | implemented in `contracts/SettlementGateway.sol` |
| Mock ERC-20 for local/testnet MVP | implemented in `contracts/MockERC20.sol`; HashKey testnet has deployed `mUSDC` and `mUSDT` |
| Receipt verification | implemented by matching `CheckoutSettled` event fields |
| HashKey testnet deploy script | implemented; requires RPC, deployer key, signer key, and gas |
| Gate 1 KYT / AML | mock only; live integration under validation |
| Gate 2 Primus zkTLS KYC / Authorization | mock/roadmap |

## Architecture

```
AGENT (ACP / AP2 / x402 / MPP)
  -> Demo API normalizes to canonical checkout
  -> Gateway signs payment terms
  -> Agent submits SettlementGateway.pay()
  -> Contract checks signature, expiry, replay, spending limit
  -> ERC-20 transferFrom(agent, merchant treasury)
  -> API verifies CheckoutSettled receipt
  -> Demo order is created
```

The spending limit is enforced by the on-chain settlement contract. Primus is not used for spending-limit decisions.

## Local MVP Run

Install dependencies:

```bash
npm install
```

Start a local Anvil chain in terminal 1:

```bash
anvil --host 127.0.0.1 --port 8545
```

Create `.env.local` from `.env.example` and fill the local Anvil test keys you want to use. Then deploy the MVP contracts:

```bash
npm run deploy:local
```

Start the demo API:

```bash
PORT=8791 npm run server
```

Open the MVP console:

```bash
open http://127.0.0.1:8791
```

Run the endpoint-level smoke test:

```bash
DEMO_BASE_URL=http://127.0.0.1:8791 npm run test:e2e
```

The local deployment file is generated at `deployments/local.json` and intentionally ignored by git.

## HashKey Testnet Deploy

Set these environment variables in `.env.local`:

```bash
HASHKEY_TESTNET_RPC_URL=
HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY=
GATEWAY_SIGNER_PRIVATE_KEY=
DEMO_AGENT_PRIVATE_KEY=
EXPLORER_BASE_URL=https://hashkeychain-testnet-explorer.alt.technology
```

Then run:

```bash
npm run deploy:hashkey
```

This updates `deployments/hashkey-testnet.json` with public deployment information. If no `TOKEN_ADDRESS` is supplied, the script deploys a mock ERC-20 token for MVP testing; do not present that as real USDC/USDT settlement.

To add another mock stablecoin to an existing deployment:

```bash
TOKEN_NAME="Mock USDT" TOKEN_SYMBOL=mUSDT npm run deploy:hashkey-token
```

The current HashKey testnet deployment records two MVP test tokens:

| Symbol | Address | Status |
|---|---|---|
| `mUSDC` | `0x63431ad54ACed83B635DDEeE1ae7b4f5dfB3d65d` | mock ERC-20 |
| `mUSDT` | `0xB80eeF2d44d5055C4A8Babfb0b8c482Fa0F7cE25` | mock ERC-20 |

These are not official USDC/USDT contracts.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | MVP console |
| `GET /demo/config` | current chain/deployment readiness |
| `GET /demo/catalog` | demo products |
| `POST /demo/api/start` | create checkout, signature, calldata, protocol payload |
| `POST /demo/api/complete` | submit demo payment if configured, or verify provided tx hash |
| `GET /demo/orders/:id` | demo order receipt page |

## Verification Boundaries

- **Real in MVP:** contract signature check, expiry, replay protection, cumulative per-agent spending limit, ERC-20 transfer, event-based receipt verification.
- **Mock in MVP:** protocol ecosystem semantics, catalog/order persistence, merchant callbacks, KYT/KYC, Primus zkTLS, and the deployed `mUSDC` / `mUSDT` test tokens.
- **Never fabricate:** contract addresses, tx hashes, explorer links, provider integrations, or stablecoin token addresses.

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**
