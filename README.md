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
| Gate 2 Primus zkTLS payer verification (principal identity + payment mandate) | mock/roadmap |

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

Gate 2 (mock/roadmap) is payer verification via Primus zkTLS: the paying agent presents attestations proving two independent claims about its principal, without revealing who the principal is — (1) identity: the principal has passed KYC at a regulated institution (bring-your-own-KYC; the institution's system is the attested data source); (2) authorization: the principal's own system of record contains a live mandate authorizing this agent for this payment, with a cap covering the amount. AllScale's gateway acts as the verifier of both attestations; the attested data lives in systems AllScale does not control and cannot forge. The spending limit is enforced by the on-chain settlement contract. Primus is not used for spending-limit decisions.

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

## HashKey Chain Mainnet Deploy

> **Status: mainnet deployment support is implemented, but the contract has NOT been deployed to mainnet yet.** `deployments/hashkey-mainnet.json` does not exist until a real deployment succeeds; do not fabricate it.

Mainnet parameters:

| Item | Value |
|---|---|
| Chain ID | `177` |
| RPC | `https://mainnet.hsk.xyz` |
| Explorer | `https://hsk.blockscout.com` |
| USDC (bridged) | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` (6 decimals) |

Key rules:

- Mock tokens are forbidden on mainnet. `scripts/deploy-mainnet.js` refuses `DEPLOY_MOCK_TOKEN=true`, never deploys `MockERC20`, never calls `mint()`, and uses a minimal ERC-20 ABI for the real USDC token.
- Private keys are filled into `.env.local` only via the interactive helper (silent input, atomic write, `chmod 600`):

  ```bash
  bash scripts/setup-mainnet-secrets.sh
  ```

- `.env.local` is git-ignored and must never be committed. The Merchant Treasury only receives USDC; its private key is never needed by this repo.
- Before deploying, the script performs read-only checks: expected deployer/signer/agent addresses derived from the keys, chain ID `177`, USDC bytecode presence, `decimals() == 6`, `symbol()`, and a non-zero deployer HSK balance.
- Agent ERC-20 approval is bounded (`APPROVAL_TOKEN_UNITS`, default 1 USDC) and disabled by default (`AUTO_APPROVE=false`); unlimited (`MaxUint256`) approvals are never used on mainnet.
- KYT, KYC, and Primus zkTLS remain mock/roadmap on mainnet exactly as documented in [Verification Boundaries](#verification-boundaries).

Deploy (only after read-only checks pass and you explicitly confirm):

```bash
npm run deploy:hashkey-mainnet
```

A successful real deployment writes `deployments/hashkey-mainnet.json` (with `"mock": false` and the real contract address / tx hashes) and sets the demo agent spending limit from `SPENDING_LIMIT_TOKEN_UNITS` (default 1 USDC). The demo API reads that file automatically when `CHAIN_ID=177`, or honors an explicit `DEPLOYMENT_FILE=`.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | MVP console |
| `GET /demo/config` | current chain/deployment readiness |
| `GET /demo/catalog` | demo products |
| `POST /demo/api/start` | create checkout, signature, calldata, protocol payload |
| `POST /demo/api/complete` | submit demo payment if configured, or verify provided tx hash |
| `GET /demo/orders/:id` | persisted demo order receipt page |

The demo API atomically persists checkouts, completed orders, and claimed
transaction hashes to `.data/demo-state.json` by default, so they survive a
process restart. Set `DEMO_STATE_FILE` to another path, or to `:memory:` for
isolated tests. This file store is intended for a single API process; a
multi-instance production deployment should replace it with a transactional
database.

## Verification Boundaries

- **Real in MVP:** contract signature check, expiry, replay protection, cumulative per-agent spending limit, ERC-20 transfer, event-based receipt verification.
- **Mock in MVP:** protocol ecosystem semantics, merchant callbacks, KYT/KYC, Primus zkTLS, and the deployed `mUSDC` / `mUSDT` test tokens.
- **Never fabricate:** contract addresses, tx hashes, explorer links, provider integrations, or stablecoin token addresses.

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**
