/**
 * Verification gates — BOTH ARE MOCK HANDLERS.
 *
 * | Gate   | Check                                | Provider                        | Status               |
 * |--------|--------------------------------------|---------------------------------|----------------------|
 * | Gate 1 | KYT / AML fund-source screening      | AllScale (BlockSec KYT)         | mock (demonstration) |
 * | Gate 2 | KYC / Authorization payer credibility| Primus (zkTLS)                  | mock (roadmap)       |
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

// MOCK — provider: Primus zkTLS KYC. Roadmap, not yet integrated.
//
// Precise framing (do not change): Primus zkTLS provides data authenticity
// with selective disclosure — it proves the payer is backed by an entity
// that passed AllScale KYC and is within its authorized limit, WITHOUT
// revealing who that entity is. It is NOT private payment execution, and
// it does NOT enforce the spending limit — the on-chain settlement
// contract does (contracts/SettlementGateway.sol).
export function primusKycGate(checkout: CanonicalCheckout): GateResult {
  const flagged = checkout.agent.toLowerCase().includes(SUSPICIOUS_MARKER);
  return {
    gate: "KYC_AUTHORIZATION",
    provider: "Primus (zkTLS)",
    passed: !flagged,
    reason: flagged
      ? "Could not attest payer is backed by a KYC-verified entity (simulated)"
      : "Payer attested as backed by a KYC-verified entity, within authorized limit (simulated)",
    mock: true,
  };
}
