/**
 * Legacy mock router — normalizes multi-protocol agent payments into a
 * canonical checkout and demonstrates where verification gates sit.
 *
 * The runnable MVP path now lives in server/demo-api.js, which generates
 * signed payment terms, submits/accepts a SettlementGateway transaction,
 * and verifies the CheckoutSettled receipt.
 *
 * Flow: AGENT (x402/ACP/AP2/MPP) → ROUTER (canonical checkout)
 *       → VERIFICATION (Gate 1 KYT/AML, Gate 2 payer verification:
 *         principal identity + payment mandate attestations)
 *       → SETTLE (handled by server/demo-api.js + SettlementGateway) / BLOCK
 *
 * Verification logic shown here is a demonstration. Live KYT / KYC
 * integration is under validation.
 */

import { adapters, type RawAgentPaymentRequest } from "./protocols";
import { allScaleKytGate, primusKycGate } from "./gates";
import type { CheckoutOutcome } from "./types";

/** Default settlement target. Runtime API reads deployments/*.json instead. */
export const SETTLEMENT = {
  chainId: 133, // HashKey Chain testnet target
  contractAddress: "_TBD",
  deployTxHash: "_TBD",
  explorerBaseUrl: "_TBD",
} as const;

export function routeAgentPayment(
  request: RawAgentPaymentRequest
): CheckoutOutcome {
  // 1. Normalize the protocol-specific request into a canonical checkout.
  const checkout = adapters[request.protocol].normalize(request);

  // 2. Gate 1 — KYT / AML fund-source screening (MOCK, AllScale / BlockSec).
  const gate1 = allScaleKytGate(checkout);
  if (!gate1.passed) {
    return {
      status: "BLOCKED",
      checkout,
      gateResults: [gate1],
      blockedBy: "KYT_AML",
    };
  }

  // 3. Gate 2 — payer verification: principal identity + payment mandate
  //    attestations (MOCK, Primus zkTLS; AllScale's gateway is the verifier).
  const gate2 = primusKycGate(checkout);
  if (!gate2.passed) {
    return {
      status: "BLOCKED",
      checkout,
      gateResults: [gate1, gate2],
      blockedBy: "KYC_AUTHORIZATION",
    };
  }

  // 4. This legacy helper stops at the mocked outcome. The runnable MVP
  //    settlement path is server/demo-api.js -> contracts/SettlementGateway.sol.
  return {
    status: "SETTLED",
    checkout,
    gateResults: [gate1, gate2],
    settlementTxHash: "_TBD",
  };
}
