# AllScale Agentic Commerce Gateway

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

A hackathon MVP for **HashKey Chain On-Chain Horizon**. The repository contains
a runnable end-to-end checkout flow and a deployed HashKey Chain Mainnet
`SettlementGateway`:

1. demo request tagged as `ACP` / `AP2` / `x402` / `MPP`
2. canonical checkout generation
3. EIP-712 gateway signature over exact payment terms
4. `SettlementGateway.pay()` ERC-20 settlement
5. `CheckoutSettled` receipt verification
6. demo order creation

The runnable path accepts a protocol label and emits protocol-shaped demo
payloads. It does not connect to real ACP, AP2, x402, or MPP clients. KYT / KYC
providers are also **not live**. On non-mainnet demo networks,
`server/demo-gates.js` supplies explicit `pass`, `block_kyt`, and
`block_authorization` examples before any signature or calldata is created.
Labels such as `BlockSec 已检查` and `Primus 已验证` are display text only: every
result carries `mock: true` and `providerConnected: false`, and no provider API
is called.

## Current Status

| Component | Status |
|---|---|
| Frontend MVP console | implemented in `frontend/index.html` |
| Demo API | implemented in `server/demo-api.js` |
| Demo verification scenarios | runnable pre-signature simulator in `server/demo-gates.js`; no BlockSec or Primus connection |
| Shared canonical checkout | runtime schema and EIP-712 field order in `shared/canonical-checkout.js`; TypeScript declaration alongside it |
| Catalog / checkout / complete endpoints | implemented |
| Demo checkout / order / tx-dedup state | atomically persisted for one API process in `.data/demo-state.json` |
| Settlement contract | implemented in `contracts/SettlementGateway.sol` |
| Mock ERC-20 for local/testnet MVP | implemented in `contracts/MockERC20.sol`; HashKey testnet has deployed `mUSDC` and `mUSDT` |
| Receipt verification | implemented by matching `CheckoutSettled` event fields |
| HashKey testnet deploy script | implemented; requires RPC, deployer key, signer key, and gas |
| HashKey mainnet deployment | deployed at `0xDF0008D5C6fFb332A4A21a15018954e90f4fae01` with non-mock `USDC.e` configuration |
| ACP / AP2 / x402 / MPP adapters | interface-level mocks; no protocol client or handshake |
| Gate 1 KYT / AML | explicit pass/blocked simulator; display may say `BlockSec 已检查`, but no BlockSec request is made |
| Gate 2 Primus zkTLS payer verification (principal identity + payment mandate) | explicit pass/blocked simulator; display may say `Primus 已验证`, but no attestation is generated or verified |

## Architecture

```
DEMO INPUT (protocol label: ACP / AP2 / x402 / MPP)
  -> Demo API creates and validates one canonical checkout
  -> Optional non-mainnet demo Gate scenario runs (simulated only)
       -> BLOCKED: persist result; issue no signature, calldata, or protocol payload
       -> ALLOW: continue
  -> Gateway signs payment terms
  -> Agent submits SettlementGateway.pay()
  -> Contract checks signature, expiry, replay, spending limit
  -> ERC-20 transferFrom(agent, merchant treasury)
  -> API verifies CheckoutSettled receipt
  -> Demo order + tx claim are atomically persisted
```

`router/protocols.ts`, `router/index.ts`, and `router/gates.ts` are a separate
legacy architecture sketch. They remain explicit mocks and are not imported by
the runnable API above. The runnable scenarios live in `server/demo-gates.js`;
they are still simulations, but unlike the legacy router sketch they are wired
into `/demo/api/start` before signing.

## Canonical Checkout and Compatibility Boundary

The runnable API validates one JSON-safe `CanonicalCheckout` before signing or
encoding settlement data:

| Field | Runtime representation | Settlement role |
|---|---|---|
| `protocol` | `x402`, `acp`, `ap2`, or `mpp` | routing metadata; not signed on-chain |
| `checkoutId` | `bytes32` hex string | signed; on-chain replay key |
| `merchantId` | `bytes32` hex string | signed |
| `agent` | EVM address | signed; must equal `msg.sender` |
| `token` | EVM address | signed |
| `amount` | unsigned decimal string in token base units | signed and ABI-encoded as `uint256` |
| `treasury` | EVM address | signed transfer recipient |
| `expiresAt` | Unix timestamp in seconds | signed and enforced on-chain |
| `metadataHash` | `bytes32` hex string | signed and emitted in the receipt event |

`shared/canonical-checkout.js` owns the runtime validator, EIP-712 field order,
and `pay()` argument order. `server/demo-api.js` derives the EIP-712 value,
calldata, payment instruction, and receipt expectations from that canonical
object. Do not rename or reorder the eight signed settlement fields without a
coordinated contract migration: the deployed contract's `CHECKOUT_TYPEHASH`,
EIP-712 domain (`AllScale SettlementGateway`, version `1`), `pay()` ABI, and
`CheckoutSettled` event are compatibility boundaries.

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

On local and testnet chains, `DEMO_GATE_MODE` defaults to `simulated`. The live
console and `POST /demo/api/start` can run three deterministic examples:

| `demoScenario` | Result |
|---|---|
| `pass` | simulated Gate 1 and Gate 2 pass; the API then signs the payment instruction |
| `block_kyt` | `BLOCKED` before Gate 2, signature, calldata, or settlement |
| `block_authorization` | simulated Gate 1 passes, then Gate 2 returns `BLOCKED` before signing |

Set `DEMO_GATE_MODE=disabled` to bypass the simulator without claiming that a
live provider ran. Simulated mode is rejected on chain ID `177`; the mainnet
settlement path does not pretend that BlockSec or Primus approved a payment.

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

## HashKey Chain Mainnet Deployment

> **Status: deployed.** The public deployment record is
> `deployments/hashkey-mainnet.json`. No mock token was deployed or minted on
> mainnet.

Mainnet parameters:

| Item | Value |
|---|---|
| Chain ID | `177` |
| RPC | `https://mainnet.hsk.xyz` |
| Explorer | `https://hsk.blockscout.com` |
| USDC.e (bridged) | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` (6 decimals) |
| SettlementGateway | [`0xDF0008D5C6fFb332A4A21a15018954e90f4fae01`](https://hsk.blockscout.com/address/0xDF0008D5C6fFb332A4A21a15018954e90f4fae01) |
| Deploy transaction | [`0xafb7e6e542001e14fab6a329590f6f154a75fd1e1d0f477a2c5749e478ed0134`](https://hsk.blockscout.com/tx/0xafb7e6e542001e14fab6a329590f6f154a75fd1e1d0f477a2c5749e478ed0134) |
| Spending-limit setup | [`0xbb2791d71d4c4480a1dcdb5b11441555d2486aa40f9693efc826d68e6b16d906`](https://hsk.blockscout.com/tx/0xbb2791d71d4c4480a1dcdb5b11441555d2486aa40f9693efc826d68e6b16d906) |

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
- `DEMO_GATE_MODE=simulated` is rejected on chain ID `177`. Mainnet responses report the verification gates as `not_run`; no BlockSec or Primus approval is implied.

Deploy a new instance only after read-only checks pass and you explicitly
confirm:

```bash
npm run deploy:hashkey-mainnet
```

The deploy script writes `deployments/hashkey-mainnet.json` with `"mock": false`
and the resulting public addresses / tx hashes, and sets the demo agent spending
limit from `SPENDING_LIMIT_TOKEN_UNITS` (default 1 USDC). The demo API reads the
current record automatically when `CHAIN_ID=177`, or honors an explicit
`DEPLOYMENT_FILE=`.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | MVP console |
| `GET /demo/config` | current chain/deployment readiness |
| `GET /demo/catalog` | demo products |
| `POST /demo/api/start` | create checkout; on non-mainnet demo mode, evaluate `demoScenario` before optionally creating signature, calldata, and protocol payload |
| `POST /demo/api/complete` | reject blocked/unsigned checkouts; otherwise submit demo payment if configured, or verify provided tx hash |
| `GET /demo/orders/:id` | persisted demo order receipt page |

The demo API atomically persists checkouts, completed orders, and claimed
transaction hashes to `.data/demo-state.json` by default, so they survive a
process restart. Set `DEMO_STATE_FILE` to another path, or to `:memory:` for
isolated tests. This file store is intended for a single API process; a
multi-instance production deployment should replace it with a transactional
database.

## Verification Boundaries

- **Real in the runnable path:** canonical schema validation, EIP-712 signing, contract signature/expiry/replay/limit enforcement, ERC-20 transfer, chain/contract/event receipt matching, tx-hash reuse rejection, and single-process file persistence.
- **Runnable but simulated:** the three `server/demo-gates.js` scenarios. They can demonstrate allow/block control flow, but use no risk data, provider credentials, network calls, or zkTLS attestations.
- **Mock or not wired:** ACP/AP2/x402/MPP client semantics, `router/` adapters, live BlockSec/Primus verification, merchant callbacks, and Primus attestation generation/verification.
- **Network-specific token status:** `mUSDC` / `mUSDT` are mock tokens on testnet; the mainnet deployment record uses non-mock bridged `USDC.e`.
- **Persistence boundary:** `.data/demo-state.json` survives restart but is not a concurrent multi-instance production database. On-chain `settledCheckouts` remains the authoritative settlement replay protection.
- **Never fabricate:** contract addresses, tx hashes, explorer links, provider integrations, or stablecoin token addresses.

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**
