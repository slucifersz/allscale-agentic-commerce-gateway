# SKILL.md - Operating Manual for AI Coding Agents

Read this before changing the repo.

## Project

**AllScale Agentic Commerce Gateway** is a HashKey-focused MVP for agentic commerce payments. It demonstrates how ACP / AP2 / x402 / MPP-style agent requests can become one canonical checkout, receive signed payment terms, settle through an ERC-20 contract, and be verified from an on-chain receipt.

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

## Current Repo State

| Path | Purpose |
|---|---|
| `frontend/index.html` | MVP console that calls the demo API |
| `server/demo-api.js` | Node HTTP API for catalog, checkout start, payment completion, receipt verification, and order pages |
| `contracts/SettlementGateway.sol` | MVP settlement contract: EIP-712 signature check, expiry, replay protection, spending limit, ERC-20 transfer |
| `contracts/MockERC20.sol` | mock token for local and MVP testnet demos; current HashKey testnet deployment has `mUSDC` and `mUSDT` |
| `scripts/deploy.js` | local / HashKey testnet deploy script |
| `scripts/compile.js` | solc-js compiler helper |
| `scripts/e2e-demo.js` | endpoint-level smoke test |
| `test/SettlementGateway.t.sol` | Foundry-style contract tests; may require Foundry solc availability |
| `deployments/hashkey-testnet.json` | public HashKey deployment record; only fill with real deployed values |
| `deployments/local.json` | generated local deployment record; ignored by git |

## Run Commands

```bash
npm install
npm run compile:contracts
npm run check:js
```

Local MVP:

```bash
anvil --host 127.0.0.1 --port 8545
npm run deploy:local
PORT=8791 npm run server
DEMO_BASE_URL=http://127.0.0.1:8791 npm run test:e2e
```

HashKey testnet:

```bash
npm run deploy:hashkey
```

Required env vars for testnet: `HASHKEY_TESTNET_RPC_URL`, `HASHKEY_TESTNET_DEPLOYER_PRIVATE_KEY`, `GATEWAY_SIGNER_PRIVATE_KEY`, `DEMO_AGENT_PRIVATE_KEY`, and optionally `TOKEN_ADDRESS`, `TOKEN_DECIMALS`, `TOKEN_SYMBOL`, `EXPLORER_BASE_URL`.

Add a mock token to the existing deployment:

```bash
TOKEN_NAME="Mock USDT" TOKEN_SYMBOL=mUSDT npm run deploy:hashkey-token
```

## Red Lines

1. Never commit real private keys, mnemonics, RPC secrets, API keys, or wallet keystores.
2. Never fabricate on-chain data. Unknown deployment values stay `_TBD`.
3. Never claim KYT / KYC / Primus / BlockSec integrations are live. They are not live in this repo.
4. Keep the disclaimer verbatim in README and frontend: **"Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation."**
5. Primus zkTLS means data authenticity with selective disclosure. It is not private payment execution and does not enforce spending limits.
6. Spending limits are enforced by `SettlementGateway`, not by off-chain verification.
7. If the deploy script uses a mock token on HashKey testnet, label it as mock. Do not present `mUSDC` / `mUSDT` as official USDC/USDT.

## Implementation Notes

- `SettlementGateway.pay()` requires `msg.sender == agent`.
- The gateway signature binds `checkoutId`, `merchantId`, `agent`, `token`, `amount`, `treasury`, `expiresAt`, and `metadataHash`.
- Receipt verification in `server/demo-api.js` accepts a payment only if the transaction succeeded, targeted the configured contract, and emitted a matching `CheckoutSettled` event.
- The demo API keeps checkout and order state in memory. Persistent storage is intentionally out of scope for this MVP.
- `deployments/local.json` is generated and ignored. Regenerate it whenever Anvil restarts.

## What Is Still Out Of Scope

- Live KYT / AML provider integration
- Live Primus zkTLS attestation        Design: see docs/verification-integration-design.md
- Real merchant callback persistence
- Production database
- Production wallet UX
- Real HashKey stablecoin token configuration unless explicitly supplied
