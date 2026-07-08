/**
 * Protocol adapters — MOCK.
 *
 * Each agentic-commerce protocol (x402 / ACP / AP2 / MPP) gets a thin
 * adapter that normalizes its payment request into a CanonicalCheckout.
 * In this demo the adapters are interface-level mocks: they show the
 * intended normalization boundary, not real protocol implementations.
 */

import type { AgentProtocol, CanonicalCheckout } from "./types";

/** Minimal shape of an incoming payment request, before normalization. */
export interface RawAgentPaymentRequest {
  protocol: AgentProtocol;
  agent: string;
  token: string;
  amount: bigint;
  treasury: string;
  /** Protocol-specific payload (opaque to the router core). */
  payload: Record<string, unknown>;
}

/** One adapter per protocol; all share the same normalization contract. */
export interface ProtocolAdapter {
  protocol: AgentProtocol;
  normalize(request: RawAgentPaymentRequest): CanonicalCheckout;
}

// MOCK — deterministic demo hash, not a real cryptographic commitment.
function mockMetadataHash(request: RawAgentPaymentRequest): string {
  const seed = `${request.protocol}:${request.agent}:${request.amount}`;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return "0x" + h.toString(16).padStart(64, "0");
}

function makeAdapter(protocol: AgentProtocol): ProtocolAdapter {
  return {
    protocol,
    // MOCK — normalization only; no real protocol handshake happens here.
    normalize(request: RawAgentPaymentRequest): CanonicalCheckout {
      return {
        checkoutId: `chk_${protocol.toLowerCase()}_${request.agent.slice(-6)}`,
        protocol,
        agent: request.agent,
        token: request.token,
        amount: request.amount,
        treasury: request.treasury,
        expiry: Math.floor(Date.now() / 1000) + 15 * 60,
        metadataHash: mockMetadataHash(request),
      };
    },
  };
}

export const adapters: Record<AgentProtocol, ProtocolAdapter> = {
  x402: makeAdapter("x402"),
  ACP: makeAdapter("ACP"),
  AP2: makeAdapter("AP2"),
  MPP: makeAdapter("MPP"),
};
