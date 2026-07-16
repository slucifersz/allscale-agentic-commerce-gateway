# Demo Script - AllScale Agentic Commerce Gateway MVP

> **Verification logic shown here is a demonstration. Live KYT / KYC integration is under validation.**

Audience: HashKey Chain On-Chain Horizon hackathon judges. Length: 3-4 minutes.

## Setup

1. Start the MVP API and open the console:

   ```bash
   PORT=8791 npm run server
   open http://127.0.0.1:8791
   ```

2. Confirm the deployment panel shows:
   - `MVP ready`
   - chain ID
   - settlement contract address
   - token address
   - demo agent
   - merchant treasury

3. State the boundary clearly: protocol payloads are demonstrations and KYT /
   KYC are not wired into the payment path. This MVP proves canonical checkout
   signing, on-chain settlement, receipt verification, and restart-safe demo
   order state. `mUSDC` / `mUSDT` are testnet mock tokens; the recorded mainnet
   deployment uses non-mock bridged `USDC.e`.

## Opening

> "AI agents can speak different commerce protocols: ACP, AP2, x402, and MPP. Merchants do not want four separate payment stacks. This gateway normalizes the request into one checkout, signs exact HashKey payment terms, settles through a contract, and verifies the receipt before creating the merchant order."

## Path - Complete Order

1. Choose a protocol-shaped demo, for example `ACP checkout session`.
2. Choose `Agent Pass`.
3. Choose `mUSDC` / `mUSDT` on testnet, or `USDC.e` with the mainnet configuration.
4. Click `Generate`.

Say:

> "The selected protocol changes the demo payload shape; it is not a live
> protocol client. The gateway has also produced one validated canonical
> checkout. Its checkout ID, merchant ID, agent, token, amount, treasury,
> expires-at timestamp, and metadata hash are the exact terms signed by the
> gateway and used to build calldata."

Point to:

- protocol payload JSON
- payment instruction JSON
- router / contract address
- gateway signature
- calldata

4. Click `Complete`.

Say:

> "For the MVP, the demo agent submits `SettlementGateway.pay()`. The contract checks the gateway signature, expiry, replay status, and the agent spending limit. Then it transfers ERC-20 funds directly from the agent to the merchant treasury."

5. Wait for `Order completed and receipt verified`.

Say:

> "The API does not simply trust a tx hash. It reads the receipt, finds the `CheckoutSettled` event, and checks that checkout ID, merchant ID, agent, token, amount, treasury, and metadata hash all match the original checkout."

6. Open the order link.

Say:

> "This is the order page backed by verified on-chain payment evidence."

## Mock vs Real

| Element | Status |
|---|---|
| Protocol payloads | demo implementations |
| Catalog | static demo data |
| Checkouts, orders, tx deduplication | persistent single-process file store |
| Gateway signature | real EIP-712 signature |
| Settlement contract | real local/testnet contract plus recorded HashKey mainnet deployment |
| ERC-20 transfer | real contract call; testnet tokens are mock, recorded mainnet token is non-mock `USDC.e` |
| Receipt verification | real event matching |
| KYT / AML | mock / under validation |
| Primus zkTLS payer verification (identity + mandate attestations) | roadmap / not integrated |

## Closing

> "The MVP turns the original front-end-only demo into a runnable payment loop.
> The remaining product work is real protocol clients, live KYT/KYC, merchant
> callbacks, a multi-instance production database, and production wallet UX."
