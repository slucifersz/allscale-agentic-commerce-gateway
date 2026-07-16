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
| `server/demo-gates.js` | deterministic non-mainnet allow/block examples; display-only BlockSec/Primus labels with no provider calls |
| `server/state-store.js` | atomic single-process file persistence for checkouts, orders, and claimed transaction hashes |
| `shared/canonical-checkout.js` | runtime canonical schema, EIP-712 field order, and `pay()` argument derivation |
| `shared/canonical-checkout.d.ts` | TypeScript declaration for the shared runtime schema |
| `contracts/SettlementGateway.sol` | MVP settlement contract: EIP-712 signature check, expiry, replay protection, spending limit, ERC-20 transfer |
| `contracts/MockERC20.sol` | mock token for local and MVP testnet demos; current HashKey testnet deployment has `mUSDC` and `mUSDT` |
| `scripts/deploy.js` | local / HashKey testnet deploy script |
| `scripts/compile.js` | solc-js compiler helper |
| `scripts/e2e-demo.js` | endpoint-level smoke test |
| `scripts/canonical-checkout-test.js` | canonical schema, EIP-712, and ABI compatibility checks |
| `scripts/state-store-test.js` | persistence, restart recovery, and tx-reuse checks |
| `test/SettlementGateway.t.sol` | Foundry-style contract tests; may require Foundry solc availability |
| `deployments/hashkey-testnet.json` | public HashKey deployment record; only fill with real deployed values |
| `deployments/hashkey-mainnet.json` | public deployed mainnet contract, non-mock USDC.e, and setup transaction record |
| `deployments/local.json` | generated local deployment record; ignored by git |

## Run Commands

```bash
npm install
npm run compile:contracts
npm run check:js
npm run test:canonical
npm run test:state
npm run test:gates
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
5. Primus zkTLS means data authenticity with selective disclosure over external data sources (a regulated institution's KYC records; the principal's own mandate system). AllScale is the verifier, not the attested data source. It is not private payment execution and does not enforce spending limits.
6. Spending limits are enforced by `SettlementGateway`, not by off-chain verification.
7. If the deploy script uses a mock token on HashKey testnet, label it as mock. Do not present `mUSDC` / `mUSDT` as official USDC/USDT.

## Implementation Notes

- `SettlementGateway.pay()` requires `msg.sender == agent`.
- `CanonicalCheckout` uses `merchantId` and `expiresAt` (not `expiry`), and represents `amount` as a JSON-safe unsigned decimal string. `protocol` is routing metadata; the other eight fields are the signed settlement request.
- EIP-712 values, `pay()` calldata, payment instructions, and receipt expectations must be derived from `shared/canonical-checkout.js`; do not rebuild parallel checkout shapes in the server.
- The gateway signature binds `checkoutId`, `merchantId`, `agent`, `token`, `amount`, `treasury`, `expiresAt`, and `metadataHash`.
- Receipt verification in `server/demo-api.js` accepts a payment only if the RPC chain matches the checkout, the transaction succeeded, targeted the checkout's recorded contract, and emitted a field-matching `CheckoutSettled` event.
- The demo API atomically persists checkout, order, and transaction-deduplication state to `.data/demo-state.json` by default. This is a single-process demo store, not a multi-instance production database.
- `router/protocols.ts` and both functions in `router/gates.ts` remain mocks. They are not imported by the runnable demo API; do not describe protocol handshakes or verification providers as live.
- `server/demo-gates.js` is wired into the runnable API before signing, but it is still a deterministic simulator. Preserve `mock: true`, `providerConnected: false`, and the provider-call disclaimer until real integrations exist.
- A blocked checkout must never contain `paymentInstruction`, gateway signature, calldata, or protocol payload, and `/demo/api/complete` must reject it.
- `DEMO_GATE_MODE=simulated` is forbidden on HashKey mainnet (chain ID `177`). Mainnet must not turn simulated passes into real settlement authorization.
- `deployments/local.json` is generated and ignored. Regenerate it whenever Anvil restarts.

## What Is Still Out Of Scope

- Live KYT / AML provider integration
- Live Primus zkTLS attestations (identity + mandate)
- Live integration design for both gates: [docs/verification-integration-design.md](docs/verification-integration-design.md)
- Real merchant callback persistence
- Production database
- Production wallet UX
- Additional production token and network configurations beyond the recorded HashKey mainnet USDC.e deployment
