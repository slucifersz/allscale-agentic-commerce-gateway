/**
 * Verification gates — BOTH ARE MOCK HANDLERS.
 *
 * | Gate   | Check                                              | Provider                | Status               |
 * |--------|----------------------------------------------------|--------------------------|----------------------|
 * | Gate 1 | KYT / AML fund-source screening                    | AllScale (BlockSec KYT)  | mock (demonstration) |
 * | Gate 2 | Payer verification: principal identity + mandate   | Primus (zkTLS)           | mock (roadmap)       |
 *
 * Provider names describe architectural intent only — neither integration
 * is live. Verification logic shown here is a demonstration. Live KYT / KYC
 * integration is under validation.
 */

import type { CanonicalCheckout, GateResult } from "./types";

/**
 * Demo-only heuristic: agents whose id carries this marker simulate a
 * "suspicious" payer so the blocked path can be demonstrated.
 */
const SUSPICIOUS_MARKER = "suspicious";

// MOCK — provider: AllScale KYT/AML (BlockSec). Live integration under validation.
export function allScaleKytGate(checkout: CanonicalCheckout): GateResult {
  const flagged = checkout.agent.toLowerCase().includes(SUSPICIOUS_MARKER);
  return {
    gate: "KYT_AML",
    provider: "AllScale (BlockSec KYT)",
    passed: !flagged,
    reason: flagged
      ? "Fund source flagged by KYT/AML screening (simulated)"
      : "No adverse fund-source signals (simulated)",
    mock: true,
  };
}

// MOCK — provider: Primus zkTLS payer verification. Roadmap, not yet integrated.
//
// Precise framing (do not change): Primus zkTLS provides data authenticity
// with selective disclosure — it proves that an external data source
// genuinely contains specific states; it does not produce KYC or
// authorization conclusions itself. Gate 2 verifies TWO attestations, one
// gate — two independent claims about the paying agent's principal, WITHOUT
// revealing who the principal is:
//   (1) Identity — the principal has passed KYC at a regulated institution
//       (bring-your-own-KYC; the institution's system is the attested data
//       source);
//   (2) Authorization — the principal's own system of record (e.g. its
//       procurement or agent-management platform) contains a live mandate
//       authorizing this agent for this payment, with a cap covering the
//       amount.
// AllScale's gateway acts as the VERIFIER of both attestations, not the
// attested data source — the attested data lives in systems AllScale does
// not control and cannot forge, which is precisely what makes the
// verification meaningful to merchants. It is NOT private payment
// execution, and it does NOT enforce the spending limit — the on-chain
// settlement contract does (contracts/SettlementGateway.sol).
export function primusKycGate(checkout: CanonicalCheckout): GateResult {
  const flagged = checkout.agent.toLowerCase().includes(SUSPICIOUS_MARKER);
  return {
    gate: "KYC_AUTHORIZATION",
    provider: "Primus (zkTLS)",
    passed: !flagged,
    reason: flagged
      ? "Could not attest principal identity or payment mandate (simulated)"
      : "Attested: principal KYC-verified at a regulated institution; live mandate covers this payment (simulated)",
    mock: true,
  };
}
