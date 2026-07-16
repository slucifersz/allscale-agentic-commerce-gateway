/**
 * Canonical checkout types are declared beside their runtime validator so the
 * runnable API and the TypeScript router share one public schema boundary.
 */
import type {
  AgentProtocol,
  CanonicalCheckout,
} from "../shared/canonical-checkout";

export type { AgentProtocol, CanonicalCheckout };

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
       * Settlement tx hash, if a caller wires this mock router to a real
       * SettlementGateway payment. The runnable MVP does this in server/demo-api.js.
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
