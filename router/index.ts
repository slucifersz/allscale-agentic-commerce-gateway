/**
 * Router — normalizes multi-protocol agent payments into a canonical
 * checkout, runs the two verification gates, and either settles through
 * the HashKey Chain testnet settlement contract or blocks the checkout
 * before settlement.
 *
 * Flow: AGENT (x402/ACP/AP2/MPP) → ROUTER (canonical checkout)
 *       → VERIFICATION (Gate 1 KYT/AML, Gate 2 KYC/Authorization)
 *       → SETTLE (HashKey, within on-chain spending limit) / BLOCK
 *
 * Verification logic shown here is a demonstration. Live KYT / KYC
 * integration is under validation.
 */

import { adapters, type RawAgentPaymentRequest } from "./protocols";
import { allScaleKytGate, primusKycGate } from "./gates";
import type { CheckoutOutcome } from "./types";

/** Deployment record for the settlement contract — all _TBD except chainId. */
export const SETTLEMENT = {
  chainId: 133, // HashKey Chain testnet — the only real value at this stage
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

  // 3. Gate 2 — KYC / Authorization payer credibility (MOCK, Primus zkTLS).
  const gate2 = primusKycGate(checkout);
  if (!gate2.passed) {
    return {
      status: "BLOCKED",
      checkout,
      gateResults: [gate1, gate2],
      blockedBy: "KYC_AUTHORIZATION",
    };
  }

  // 4. Both gates passed → settle via the HashKey testnet settlement
  //    contract. The spending limit is enforced ON-CHAIN by that contract
  //    (contracts/SettlementGateway.sol), not by any off-chain verifier.
  //    No real transaction is sent here: the contract is not deployed yet,
  //    so the tx hash stays _TBD until real on-chain info is provided.
  return {
    status: "SETTLED",
    checkout,
    gateResults: [gate1, gate2],
    settlementTxHash: "_TBD",
  };
}
