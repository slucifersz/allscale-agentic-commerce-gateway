# AllScale Agentic Commerce Gateway

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

A hackathon demo for **HashKey Chain On-Chain Horizon** (submission deadline: **July 11, 2026**).

AI agents initiate payments through multiple agentic-commerce protocols (**x402 / ACP / AP2 / MPP**). A router normalizes every request into one **canonical checkout** (checkout ID, token, amount, treasury, expiry, metadata hash). Before any funds settle to the merchant, the checkout must pass **two verification gates**; settlement then executes through a contract on **HashKey Chain testnet (chainId 133)** — and only within the **spending limit enforced by the on-chain contract**. If either gate fails, the checkout is **blocked before settlement**.

This repo is a demo skeleton built to validate AllScale's "AI × Payments" direction — clarity and demo-readiness over feature completeness.

## Architecture

```
                         AGENT LAYER (multi-protocol)
   x402 agent      ACP agent      AP2 agent      MPP agent
        \              |              |              /
         \             |              |             /
          v            v              v            v
   ┌─────────────────────────────────────────────────────┐
   │                       ROUTER                        │
   │   normalize → canonical checkout                    │
   │   { checkoutId, token, amount, treasury,            │
   │     expiry, metadataHash }                          │
   └──────────────────────────┬──────────────────────────┘
                              v
   ┌─────────────────────────────────────────────────────┐
   │                    VERIFICATION                     │
   │  Gate 1: KYT / AML fund-source screening            │
   │          provider: AllScale (BlockSec KYT) — MOCK   │
   │  Gate 2: KYC / Authorization payer credibility      │
   │          provider: Primus (zkTLS) — MOCK (roadmap)  │
   └───────────┬─────────────────────────────┬───────────┘
        both pass                     either fails
               v                             v
   ┌───────────────────────────┐   ┌─────────────────────┐
   │  SETTLE on HashKey Chain  │   │  BLOCK               │
   │  testnet (chainId 133)    │   │  (rejected before    │
   │  via settlement contract, │   │   settlement — no    │
   │  within on-chain          │   │   funds move)        │
   │  spending limit           │   └─────────────────────┘
   └───────────────────────────┘
```

## Verification gates

| Gate | Check | Provider | Status |
|------|-------|----------|--------|
| Gate 1 | KYT / AML fund-source screening | AllScale (powered by BlockSec KYT) | **mock (demonstration)** |
| Gate 2 | KYC / Authorization payer credibility | Primus (zkTLS) | **mock (roadmap)** |

Provider names above describe the **intended architecture** only. Neither integration is live yet; both gates run as mock handlers in this demo (`allScaleKytGate()` and `primusKycGate()` in [`router/gates.ts`](router/gates.ts)).

**About Primus (Gate 2), stated precisely:** Primus zkTLS provides **data authenticity with selective disclosure** — it can prove that the payer is backed by an entity that passed AllScale KYC and is within its authorized limit, *without revealing who that entity is*. It is **not** "private payment execution", and it does **not** decide the spending limit. The **spending limit is enforced by the on-chain settlement contract**.

## What is real vs. mock

| Component | Status |
|-----------|--------|
| Protocol adapters (x402 / ACP / AP2 / MPP) | mock — interface-level normalization only |
| Router → canonical checkout | demo logic (local, off-chain) |
| Gate 1 — AllScale KYT/AML (BlockSec) | **mock** (demonstration; live integration under validation) |
| Gate 2 — Primus zkTLS KYC | **mock** (roadmap; not yet integrated) |
| Settlement contract on HashKey Chain testnet | **the only intended real on-chain component** — address / tx to be provided; all values currently `_TBD` |
| Frontend demo | mock data, with placeholders reserved for the real tx hash and explorer link |

## Repository layout

```
contracts/            Solidity stub for the settlement contract (interface skeleton, not deployed here)
deployments/          HashKey testnet deployment record — chainId 133 real, everything else _TBD
router/               Canonical checkout types, protocol adapters (mock), verification gates (mock)
frontend/             Static demo page (mock data; placeholders for real tx hash + explorer link)
demo-script.md        Step-by-step demo walkthrough (trusted vs. suspicious agent)
SKILL.md              Operating manual for any AI coding agent continuing this project
```

## Running the demo

The frontend is a single static page — open it directly:

```bash
open frontend/index.html
```

See [`demo-script.md`](demo-script.md) for the presentation flow.

## Network

- **Chain:** HashKey Chain testnet
- **chainId:** `133`
- **Settlement contract:** `_TBD` (to be deployed and provided manually — see [`deployments/hashkey-testnet.json`](deployments/hashkey-testnet.json))

---

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**
