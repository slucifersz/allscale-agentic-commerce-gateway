# Verification Gates — Live Integration Design

> **Status: design document.** Nothing described here is implemented or live.
> Both verification gates in this repository are mock handlers
> (`router/gates.ts`). This document specifies how the mocks would be
> replaced by real integrations, so the path from demonstration to
> production is explicit.

> Verification logic shown in this repository is a demonstration.
> Live KYT / KYC integration is under validation.

## Summary

In the current demo, both gates are mocked but preserve the same interface
and ordering as the intended live system. The production path replaces each
mock with an external verification call while keeping the canonical
checkout, the `GateResult` contract, and the settlement sequencing
unchanged. The mocks are placeholders for calls, not placeholders for
architecture.

---

## 1. Current state (what the mocks do today)

| Gate | Check | Provider (architectural intent) | Current implementation |
|------|-------|--------------------------------|------------------------|
| Gate 1 | KYT / AML fund-source screening | AllScale KYT service (intended BlockSec-backed integration; BlockSec KYT is used in AllScale's production products, but no integration exists in this repo) | `allScaleKytGate()` — flags a checkout if the agent id contains a demo marker; no external call |
| Gate 2 | KYC / payer authorization | Primus (zkTLS) | `primusKycGate()` — same demo marker heuristic; no attestation is generated or verified |

Both functions return a `GateResult` (`router/types.ts`) and run **off-chain,
before settlement**. If either gate fails, the payment is blocked and the
`pay()` transaction is never sent. This sequencing — verify first, settle
only after both gates pass — is unchanged in the live design.

What is already real and stays as-is:

- **Spending-limit enforcement** — on-chain in `SettlementGateway.sol`
  (`setSpendingLimit`, per-agent cumulative accounting). Primus does not
  and will not enforce spending limits.
- **EIP-712 gateway signature verification** — on-chain.
- **Replay protection** (one settlement per checkout id) — on-chain.

---

## 2. Gate 1 — Live KYT / AML integration (AllScale KYT service)

### What changes

`allScaleKytGate()` becomes an async call to AllScale's KYT screening
service (intended BlockSec-backed), invoked by the gateway backend between
checkout normalization and settlement submission.

### Data flow

```
CanonicalCheckout
   └─ payer address (checkout.agent), token, amount, chain id
        └─ POST → AllScale KYT screening endpoint
             └─ response: risk level, risk categories, hit details
                  └─ mapped → GateResult { passed, reason }
```

### Request (conceptual)

| Field | Source |
|-------|--------|
| `address` | `checkout.agent` — the paying address |
| `chainId` | 133 (HashKey Chain testnet) / production chain id |
| `token`, `amount` | from the canonical checkout, for context-aware screening |

### Response mapping

| KYT outcome | `GateResult.passed` | `reason` |
|-------------|--------------------|----------|
| No adverse signals | `true` | "No adverse fund-source signals" |
| High-risk source (stolen funds, mixer, sanctioned address, blocklist hit) | `false` | Category returned by screening, e.g. "Fund source flagged: sanctioned-address exposure" |
| Screening unavailable / timeout | `false` (fail-closed) | "KYT screening unavailable — settlement withheld" |

**Fail-closed is deliberate:** if screening cannot complete, the payment is
held, not settled. A merchant-facing retry/manual-review queue is the
production follow-up.

### Prerequisites

- AllScale KYT screening credentials for this gateway — organizational,
  not hackathon-scoped. (BlockSec KYT is already used inside AllScale's
  production products; extending it to this gateway is the intended path,
  but has not been established for this demo.)
- Latency budget: screening runs once per checkout, before `pay()` is
  submitted; no on-chain change required.

### Contract impact

None. Gate 1 is purely off-chain. `SettlementGateway.sol` is unchanged.

---

## 3. Gate 2 — Live payer authorization (Primus zkTLS)

### Precise scope (framing must not drift)

Primus zkTLS provides **data authenticity with selective disclosure**. It
does not produce KYC or authorization conclusions itself. What it can prove
is that an AllScale-controlled data source genuinely contains specific
states — e.g. `kyc_status: passed`, `agent_authorized: true`,
`mandate_cap: N` — without revealing the underlying identity.

In short: **Primus attests that the data is real; AllScale's systems are
what produce the KYC and authorization states.**

It is **not** private payment execution, and it does **not** enforce
spending limits — the on-chain settlement contract does.

### Key prerequisite: an attestable AllScale data source

This requires an AllScale-controlled web/API surface exposing the relevant
KYC and mandate fields in a stable, attestable format. Gate 2 only works if
there is a concrete, stable endpoint whose fields Primus can attest over —
"which API, which fields" must be answerable. Defining and maintaining that
surface is part of the integration work, not a given.

### What changes

`primusKycGate()` becomes verification of a zkTLS attestation supplied with
the checkout, instead of a heuristic.

### Attestation flow

```
1. Agent's principal completes AllScale KYC (existing AllScale capability).
2. At payment time, the agent (or its wallet infrastructure) obtains a
   Primus zkTLS attestation over the AllScale KYC/mandate data source:
      attested fields: kyc_status = passed,
                       agent_authorized = true,
                       mandate_cap ≥ checkout amount
      disclosed: the attested claims only — not the entity's identity.
3. The attestation is attached to the checkout request.
4. Gate 2 verifies the attestation (Primus verifier / SDK):
      valid + claims cover this checkout   → passed = true
      invalid, expired, or claims too narrow → passed = false (fail-closed)
```

### Response mapping

| Verification outcome | `GateResult.passed` | `reason` |
|----------------------|--------------------|----------|
| Valid attestation covering this checkout | `true` | "Attested: payer backed by a KYC-passed entity, payment within authorized mandate" |
| Missing / invalid / expired attestation | `false` | "Could not attest payer authorization from AllScale data source" |

### Mandate cap vs. spending limit — two different controls

These are deliberately separate and must not be conflated:

> **Gate 2 proves per-payment authorization context.**
> **The contract enforces cumulative spending limits.**

| Control | Question it answers | Where it is decided |
|---------|--------------------|--------------------|
| Mandate cap (Gate 2, off-chain attestation) | "Is this single payment within what the principal authorized this agent to do?" | Primus attestation over AllScale's mandate data |
| Spending limit (on-chain) | "Has this agent's cumulative spend exceeded its on-chain limit?" | `SettlementGateway.sol`, per-agent accumulation |

A payment must satisfy both: an attested per-payment mandate off-chain, and
the cumulative on-chain limit at settlement time.

### Prerequisites

- An attestable AllScale KYC/mandate data surface (see above).
- Primus verifier SDK integration in the gateway backend.
- An attestation issuance path for agents (agent-side tooling) — the larger
  share of the work, and the reason this gate is roadmap rather than
  hackathon scope.

### Contract impact

None required for the MVP design. (Optional future hardening: submit an
attestation reference on-chain for audit purposes.)

---

## 4. Replacement path (why this is a drop-in change)

Both live integrations keep the existing interfaces:

- Input stays `CanonicalCheckout`; output stays `GateResult`
  (`router/types.ts`). The functions become `async`, which the calling
  pipeline already tolerates.
- The demo API (`server/demo-api.js`) and frontend consume `GateResult`
  fields (`passed`, `reason`, `provider`) — no UI contract change.
- `mock: true` becomes `mock: false` per gate as each integration goes
  live, so the UI can drop the MOCK badge per gate independently.
- Gate ordering and fail-closed blocking (verify → only then settle) are
  unchanged.

Rollout order: **Gate 1 first** (single off-chain API call, no agent-side
tooling), then Gate 2.

## 5. Out of scope for this MVP

- Private on-chain transfers (this is not a privacy-payment system)
- On-chain KYC verification (KYC states live in AllScale's systems, not on
  chain)
- Primus-based spending-limit enforcement (limits are on-chain, in the
  settlement contract)
- Fully automated manual-review workflow for held payments
- Production-grade retry / dispute / compliance operations

## 6. What remains hard

The hard part is not replacing the function body — the interfaces are
designed so that swap is mechanical. The hard part is productionizing
everything around it: the attestable data sources, credentials and access
control, the attestation issuance flow for agents, retry behavior,
the manual-review queue for held payments, and the operational compliance
workflow. That work is why both gates ship as mocks in this demo and as
design here.

## 7. Honest boundary

- This is a design document. No BlockSec or Primus integration exists in
  this repository.
- Provider names describe architectural intent. BlockSec KYT is used in
  AllScale's existing production products; no BlockSec or Primus
  integration has been established for this demo.
- The demo disclaimer remains in force verbatim:
  **"Verification logic shown here is a demonstration. Live KYT / KYC
  integration is under validation."**
