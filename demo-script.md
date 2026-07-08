# Demo Script — AllScale Agentic Commerce Gateway

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

Audience: HashKey Chain On-Chain Horizon hackathon judges. Length: ~3 minutes.
All checkout data in the demo is **mock**; the only intended real on-chain component is the settlement contract on HashKey Chain testnet (chainId 133), whose address / tx are currently `_TBD`.

## Setup

1. Open `frontend/index.html` in a browser (no build step needed).
2. Confirm the amber disclaimer banner is visible at the top — mention it up front: the two verification gates are mock handlers that demonstrate the architecture; provider names (AllScale/BlockSec, Primus) describe design intent, not live integrations.

## Opening line (~20s)

> "AI agents are starting to pay for things over protocols like x402, ACP, AP2 and MPP. Merchants can't accept those payments blindly — they need compliance checks *before* settlement. This gateway normalizes any agent protocol into one canonical checkout, runs two verification gates, and only then settles on HashKey Chain."

Point at the **Verification gates** table on the page: Gate 1 = KYT/AML (AllScale, powered by BlockSec — mock, demonstration), Gate 2 = KYC/Authorization (Primus zkTLS — mock, roadmap).

## Path 1 — Trusted agent (~60s)

**Click:** `▶ Trusted agent (settles)`

What appears, step by step (all simulated):

1. **AGENT** — a trusted agent initiates a payment over x402.
2. **ROUTER** — the request is normalized into a canonical checkout: checkout ID, token, amount, treasury, expiry, metadata hash. *Say: "whatever protocol the agent speaks, the merchant sees this one shape."*
3. **Gate 1 ✅** — KYT/AML fund-source screening passes (mock).
4. **Gate 2 ✅** — Primus zkTLS attestation passes (mock). *Say precisely: "Primus proves the payer is backed by a KYC-verified entity within its authorized limit — without revealing who that entity is. Data authenticity with selective disclosure, not private payment execution."*
5. **SETTLE ✅** — settlement executes via the HashKey testnet contract, **within the spending limit enforced by the contract on-chain**.

Expected on screen: green **SETTLED** verdict with tx hash slot.
⚠️ The tx hash and explorer link currently show `_TBD` — these are reserved placeholders for the real settlement transaction once the contract is deployed. Do not present them as live yet; say "this is where the real HashKey explorer link will go."

## Path 2 — Suspicious agent (~60s)

**Click:** `▶ Suspicious agent (blocked)`

1. **AGENT** — a suspicious agent initiates a payment over ACP.
2. **ROUTER** — same canonical checkout normalization.
3. **Gate 1 ⛔** — KYT/AML screening flags the fund source (mock).
4. **Gate 2** — never evaluated; pipeline short-circuits.
5. **SETTLE** — never reached.

Expected on screen: red **BLOCKED before settlement** verdict.
*Say: "the checkout dies before it ever touches the chain — no funds move. That's the merchant-protection story."*

## Closing (~30s)

- Recap the flow: AGENT → ROUTER → two gates → SETTLE / BLOCK.
- Be explicit about status: gates are **mock** (Gate 1: live AllScale/BlockSec KYT integration under validation; Gate 2: Primus zkTLS on the roadmap). The **settlement contract on HashKey testnet is the real on-chain piece** — deployment info lands in `deployments/hashkey-testnet.json` and the frontend placeholders.

## Mock vs. real cheat sheet

| Element in demo | Mock or real? |
|---|---|
| Agent identities, checkout data, amounts | Mock |
| Gate 1 KYT/AML result | Mock (demonstration) |
| Gate 2 Primus zkTLS result | Mock (roadmap) |
| Settlement tx hash / explorer link | `_TBD` placeholder — real values added after deployment |
| chainId 133 (HashKey Chain testnet) | Real target network |
