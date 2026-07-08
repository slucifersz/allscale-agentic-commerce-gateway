/**
 * Canonical checkout — the single normalized shape every agent payment
 * protocol (x402 / ACP / AP2 / MPP) is routed into before verification
 * and settlement.
 */

export type AgentProtocol = "x402" | "ACP" | "AP2" | "MPP";

export interface CanonicalCheckout {
  /** Canonical checkout identifier assigned by the router. */
  checkoutId: string;
  /** Which agent protocol originated this payment. */
  protocol: AgentProtocol;
  /** Payer agent identifier / address (demo: mock value). */
  agent: string;
  /** Settlement token (ERC-20 address on HashKey Chain testnet — _TBD). */
  token: string;
  /** Amount in the token's smallest unit. */
  amount: bigint;
  /** Merchant treasury address (demo: mock value). */
  treasury: string;
  /** Unix timestamp after which the checkout is no longer settleable. */
  expiry: number;
  /** Hash of the checkout metadata (order details, agent context, etc.). */
  metadataHash: string;
}

/** Result of one verification gate. */
export interface GateResult {
  gate: "KYT_AML" | "KYC_AUTHORIZATION";
  /** Architectural provider — mock in this demo, see gates.ts. */
  provider: string;
  passed: boolean;
  /** Human-readable reason (shown in the demo UI). */
  reason: string;
  /** Always true in this repo: both gates are mock handlers. */
  mock: true;
}

/** Final routing outcome for a checkout. */
export type CheckoutOutcome =
  | {
      status: "SETTLED";
      checkout: CanonicalCheckout;
      gateResults: GateResult[];
      /**
       * Real settlement tx hash on HashKey Chain testnet (chainId 133).
       * _TBD until the settlement contract is actually deployed and a
       * real transaction exists. Never fabricate this value.
       */
      settlementTxHash: "_TBD" | string;
    }
  | {
      status: "BLOCKED";
      checkout: CanonicalCheckout;
      gateResults: GateResult[];
      /** Which gate blocked the checkout (before settlement). */
      blockedBy: "KYT_AML" | "KYC_AUTHORIZATION";
    };
