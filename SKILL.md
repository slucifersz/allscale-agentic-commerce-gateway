# SKILL.md — Operating Manual for AI Coding Agents

This file is for any AI coding agent (or human) continuing work on this repo. Read it fully before changing anything.

## What this project is

**AllScale Agentic Commerce Gateway** — a hackathon demo showing AI agent payments (x402 / ACP / AP2 / MPP) normalized into a canonical checkout, screened by two verification gates, then settled on **HashKey Chain testnet (chainId 133)**.

- Event: HashKey Chain **On-Chain Horizon** hackathon
- **Submission deadline: July 11, 2026**
- Goal: validate AllScale's "AI × Payments" direction. Optimize for clarity, demo-readiness, and precise claims — **not** feature completeness.

## Architecture overview

```
AGENT (x402 / ACP / AP2 / MPP)          — mock protocol adapters
  → ROUTER (canonical checkout)         — demo logic, off-chain
    → Gate 1: KYT / AML fund-source     — MOCK (provider: AllScale / BlockSec KYT; live integration under validation)
    → Gate 2: KYC / Authorization       — MOCK (provider: Primus zkTLS; roadmap, not yet integrated)
      → both pass → SETTLE on HashKey testnet, within ON-CHAIN spending limit  — contract REAL (pending deployment; all info _TBD)
      → either fails → BLOCK before settlement
```

Current mock/real status per stage:

| Stage | Status |
|---|---|
| Protocol adapters | mock |
| Router / canonical checkout | demo logic |
| Gate 1 (AllScale KYT/AML via BlockSec) | **mock — demonstration** |
| Gate 2 (Primus zkTLS KYC/Authorization) | **mock — roadmap** |
| Settlement contract on HashKey testnet | **the only intended real on-chain component**; not deployed from this repo — real address/tx provided manually later |
| Frontend | mock data + `_TBD` placeholders for real tx/explorer link |

## Directory map

| Path | Contents | Placeholder status |
|---|---|---|
| `contracts/SettlementGateway.sol` | Solidity **stub**: interface skeleton for settle entry point, on-chain spending-limit check, events. Reverts by design. | Implementation `_TBD`; will be superseded/confirmed by the real deployed contract code (provided manually) |
| `deployments/hashkey-testnet.json` | Deployment record. `chainId: 133` is real. | `contractAddress`, `deployTxHash`, `explorerBaseUrl`, `deployedAt` all `_TBD` — filled manually after real deployment |
| `router/types.ts` | `CanonicalCheckout`, `GateResult`, `CheckoutOutcome` types | stable, editable |
| `router/protocols.ts` | Mock adapters normalizing x402/ACP/AP2/MPP into canonical checkout | mock, editable |
| `router/gates.ts` | `allScaleKytGate()` + `primusKycGate()` — **both mock**; header comments state provider + status | mock, editable (keep the provider/status comments intact) |
| `router/index.ts` | Orchestration: normalize → gates → settle/block; `SETTLEMENT` constant mirrors the deployments file | `SETTLEMENT` fields `_TBD` except chainId |
| `frontend/index.html` | Static demo page: gate table, trusted/suspicious demo runs, disclaimer banner | tx hash + explorer link + contract info are `_TBD` placeholders (marked with HTML comments) |
| `demo-script.md` | Presentation walkthrough: trusted path (settle) vs. suspicious path (block), what's mock, what to click | update freely as demo evolves |

## RED LINES (most important — do not cross)

1. **Never fabricate on-chain data.** No invented contract addresses, tx hashes, or explorer links. Anything unknown stays `_TBD`.
2. **Never claim live integrations.** KYT / KYC / Primus / BlockSec are NOT integrated. Both gates are mock; Gate 2 is additionally *roadmap*. Provider names describe architectural intent only.
3. **Never write secrets.** No private keys, mnemonics, seeds, API keys, or RPC credentials anywhere in the repo — including deployments files and contracts.
4. **Primus framing must stay exact.** Primus zkTLS = **data authenticity / selective disclosure** (proves the payer is backed by an entity that passed AllScale KYC and is within its authorized limit, without revealing the entity's identity). It is **NOT** "private payment execution". Do not conflate the two.
5. **Spending limit is decided by the on-chain contract**, not by Primus and not by any off-chain gate. Keep this attribution correct everywhere.
6. **The disclaimer must remain** in both README.md and the frontend, verbatim: *"Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation."*

## `_TBD` placeholder inventory

All of these are replaced **manually by a human** with the actual deployed-contract info (provided by the project owner's collaborator). Do not fill them yourself.

| File | Placeholder |
|---|---|
| `deployments/hashkey-testnet.json` | `contractAddress`, `deployTxHash`, `explorerBaseUrl`, `deployedAt` |
| `router/index.ts` | `SETTLEMENT.contractAddress`, `SETTLEMENT.deployTxHash`, `SETTLEMENT.explorerBaseUrl`; `settlementTxHash` in the settled outcome |
| `frontend/index.html` | Settlement tx hash (`#tx-hash`), explorer link (`#explorer-link`), and the settlement-contract table rows (`contractAddress` / `deployTxHash` / `explorerBaseUrl`) — each marked with a `<!-- PLACEHOLDER -->` comment |
| `contracts/SettlementGateway.sol` | Function bodies marked `_TBD` (real implementation arrives with the actual deployment) |

## What you may change vs. what you must wait for

**Free to improve:**
- Frontend styling, copy, and demo interactions
- `demo-script.md` wording and flow
- Mock logic in `router/` (adapters, gate heuristics, types) — as long as gates stay clearly labeled mock and header comments stay accurate

**Wait for human input — do not invent:**
- Settlement contract implementation and its real deployed code
- Contract address, deploy tx hash, explorer base URL, deployment timestamp
- Any real on-chain transaction data
- Any claim that a KYT/KYC provider integration went live

## Git / remote operations

Repo initialization, commits, and pushes are handled **manually by the project owner**. Unless explicitly instructed otherwise in a future session, do not run `git init` / `commit` / `push` or configure remotes.
