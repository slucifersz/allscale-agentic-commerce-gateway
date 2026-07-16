export type AgentProtocol = "x402" | "acp" | "ap2" | "mpp";

/** JSON-safe normalized checkout used across routing and settlement. */
export interface CanonicalCheckout {
  protocol: AgentProtocol;
  checkoutId: string;
  merchantId: string;
  agent: string;
  token: string;
  /** Unsigned token amount in the token's smallest unit. */
  amount: string;
  treasury: string;
  /** Non-negative Unix timestamp in seconds. */
  expiresAt: number;
  metadataHash: string;
}

export const AGENT_PROTOCOLS: readonly AgentProtocol[];
export const SETTLEMENT_CHECKOUT_FIELDS: readonly Readonly<{
  name: Exclude<keyof CanonicalCheckout, "protocol">;
  type: "bytes32" | "address" | "uint256";
}>[];
export const CHECKOUT_TYPES: Readonly<{
  Checkout: typeof SETTLEMENT_CHECKOUT_FIELDS;
}>;

export function parseCanonicalCheckout(value: unknown): Readonly<CanonicalCheckout>;
export function settlementRequestFromCheckout(
  value: unknown
): Readonly<Omit<CanonicalCheckout, "protocol">>;
export function settlementArgumentsFromCheckout(
  value: unknown,
  gatewaySignature: string
): readonly [...Array<string | number>, string];
