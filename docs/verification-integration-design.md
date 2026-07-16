# Verification Gates — Live Integration Design

> **Status: design document.** Nothing described here is implemented or live.
> Both verification gates in this repository are mock handlers
> (`router/gates.ts`). This document specifies how the mocks would be
> replaced by real integrations, so the path from demonstration to
> production is explicit.

> Verification logic shown in this repository is a demonstration.
> Live KYT / KYC integration is under validation.

## Summary

In the current repository, both gates are synchronous mocks in the legacy
TypeScript router. `server/demo-api.js`, which implements the runnable payment
path, does not import that router and therefore does not execute either gate.
The interfaces illustrate the intended boundary, but a live integration also
requires async orchestration, fail-closed error handling, a non-literal
`GateResult.mock` type, and explicit wiring into the runnable path.

---

## 1. Current state (what the mocks do today)

| Gate | Check | Provider (architectural intent) | Current implementation |
|------|-------|--------------------------------|------------------------|
| Gate 1 | KYT / AML fund-source screening | AllScale KYT service (intended BlockSec-backed integration; BlockSec KYT is used in AllScale's production products, but no integration exists in this repo) | `allScaleKytGate()` — flags a checkout if the agent string contains `suspicious`; no external call |
| Gate 2 | Payer verification: principal identity + payment mandate | Primus (zkTLS) | `primusKycGate()` — same `suspicious` substring heuristic; no attestation is generated or verified |

Both functions return a `GateResult` (`router/types.ts`). They run before the
mock outcome in `router/index.ts`, but they do **not** run before settlement in
`server/demo-api.js`. Consequently, the current runnable payment API does not
provide KYT/KYC blocking. The intended live sequencing is verify first and
settle only after both gates pass.

The shared canonical input available for future wiring is:

`protocol`, `checkoutId`, `merchantId`, `agent`, `token`, `amount`, `treasury`,
`expiresAt`, and `metadataHash`. `amount` is a JSON-safe decimal string and
`expiresAt` is a Unix timestamp in seconds.

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

## 3. Gate 2 — Live payer verification (Primus zkTLS)

### Precise scope (framing must not drift)

Primus zkTLS provides **data authenticity with selective disclosure**. It
does not produce KYC or authorization conclusions itself. What it can prove
is that an external data source genuinely contains specific states —
without revealing the underlying identity.

Gate 2 is **two attestations, one gate**: the paying agent presents Primus
zkTLS attestations proving two independent claims about its principal,
without revealing who the principal is:

1. **Identity** — the principal has passed KYC at a regulated institution
   (bring-your-own-KYC; the institution's system is the attested data
   source).
2. **Authorization** — the principal's own system of record (e.g. its
   procurement or agent-management platform) contains a live mandate
   authorizing this agent for this payment, with a cap covering the amount.

In short: **Primus attests that the data is real; the regulated institution
and the principal's own systems are what produce the KYC and authorization
states. AllScale's gateway acts as the verifier of both attestations.**

It is **not** private payment execution, and it does **not** enforce
spending limits — the on-chain settlement contract does.

### Key prerequisite: attestable external data sources

Gate 2 depends on the two external data sources — the regulated
institution's KYC interface (identity) and the principal's own mandate
system (authorization) — being coverable by zkTLS attestation: concrete,
stable surfaces whose fields Primus can attest over ("which interface,
which fields" must be answerable). AllScale does not need to — and should
not — control these data sources. That is precisely what makes the
verification meaningful to merchants: the attested data lives in systems
AllScale does not control and cannot forge, so the "attesting to your own
claims" problem does not arise.

### What changes

`primusKycGate()` becomes verification of zkTLS attestations supplied with
the checkout, instead of a heuristic.

### Attestation flow

Both attestations are obtained by the agent side, presented at payment
time, and verified by AllScale's gateway, fail-closed.

**Identity attestation — data source: a regulated institution**

```
1. The agent's principal completes KYC at a regulated institution
   (bring-your-own-KYC; independent of AllScale).
2. At payment time, the agent (or its wallet infrastructure) obtains a
   Primus zkTLS attestation over the institution's KYC records:
      attested claim: kyc_status = passed (at the regulated institution)
      disclosed: the claim only — not the principal's identity.
```

**Mandate attestation — data source: the principal's own system of record**

```
3. The agent also obtains a Primus zkTLS attestation over the principal's
   own system of record (e.g. its procurement or agent-management
   platform):
      attested claims: a live mandate authorizes this agent for this
                       payment, with mandate_cap ≥ checkout amount
      disclosed: the claims only — not the principal's identity.
4. Both attestations are attached to the checkout request.
5. Gate 2 verifies both attestations (Primus verifier / SDK):
      both valid + claims cover this checkout → passed = true
      either missing, invalid, expired, or too narrow → passed = false
      (fail-closed)
```

### Response mapping

| Verification outcome | `GateResult.passed` | `reason` |
|----------------------|--------------------|----------|
| Both attestations valid and covering this checkout | `true` | "Attested: principal KYC-verified at a regulated institution; live mandate covers this payment" |
| Either attestation missing / invalid / expired | `false` | "Could not attest principal identity or payment mandate" |

### Mandate cap vs. spending limit — two different controls

These are deliberately separate and must not be conflated:

> **Gate 2 proves per-payment authorization context.**
> **The contract enforces cumulative spending limits.**

| Control | Question it answers | Where it is decided |
|---------|--------------------|--------------------|
| Mandate cap (Gate 2, off-chain attestation) | "Is this single payment within what the principal authorized this agent to do?" | Primus attestation over the principal's own mandate system of record |
| Spending limit (on-chain) | "Has this agent's cumulative spend exceeded its on-chain limit?" | `SettlementGateway.sol`, per-agent accumulation |

A payment must satisfy both: an attested per-payment mandate off-chain, and
the cumulative on-chain limit at settlement time.

### Prerequisites

- Attestation coverage of the two external data sources: the regulated
  institution's KYC interface and the principal's own mandate system (see
  above). Neither is controlled by AllScale.
- Primus verifier SDK integration in the gateway backend (AllScale as
  verifier of both attestations).
- An attestation acquisition path for agents (agent-side tooling to obtain
  both attestations at payment time) — the larger share of the work, and
  the reason this gate is roadmap rather than hackathon scope.

### Contract impact

None required for the MVP design. (Optional future hardening: submit an
attestation reference on-chain for audit purposes.)

---

## 4. Integration path

The canonical input and the conceptual `GateResult` output can remain stable,
but the current mocks are not a literal drop-in live integration. Required
changes are:

- Keep input as `CanonicalCheckout`, then extend `GateResult.mock` from the
  current literal `true` to a boolean or a mock/live discriminated union.
- Make the provider functions async and add timeouts, authenticated provider
  calls, response validation, and fail-closed error mapping.
- Make `routeAgentPayment()` async or introduce equivalent orchestration in
  `server/demo-api.js`; the current synchronous caller does not tolerate
  promises.
- Run both gates before returning payment calldata or submitting auto-payment,
  and include auditable gate results in the API response.
- Update the frontend to consume those results; it does not currently consume
  `GateResult` from the TypeScript router.
- Change `mock: true` to `mock: false` independently only after each live
  provider path is implemented and tested.

Rollout order: **Gate 1 first** (single off-chain API call, no agent-side
tooling), then Gate 2.

## 5. Out of scope for this MVP

- Private on-chain transfers (this is not a privacy-payment system)
- On-chain KYC verification (KYC states live in the regulated institution's
  systems — not in AllScale's, and not on chain)
- Primus-based spending-limit enforcement (limits are on-chain, in the
  settlement contract)
- Fully automated manual-review workflow for held payments
- Production-grade retry / dispute / compliance operations

## 6. What remains hard

The hard part is not replacing the function body — the interfaces are
designed so that swap is mechanical. The hard part is productionizing
everything around it: the attestable external data sources, credentials and access
control, the attestation acquisition flow for agents, retry behavior,
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
