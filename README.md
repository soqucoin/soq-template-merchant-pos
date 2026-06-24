# Merchant Point-of-Sale

A Soqucoin Builders League starter template. A merchant rings up a sale, signs a post-quantum payment request, and the customer's wallet verifies it is genuine and unaltered before paying. Clone it, plug in your products, and you have a quantum-safe checkout.

The strong part runs entirely offline: signing and verifying a payment request is client-side cryptography, which is exactly what a point-of-sale needs at the till.

## Quickstart

```bash
npm install
npm start
```

No network required. You will see a checkout run end to end:

```
Soqu Coffee point-of-sale

  Espresso         0.30000000 SOQ (30000000 sat)
  Croissant        0.25000000 SOQ (25000000 sat)
  Sticker pack     0.10000000 SOQ (10000000 sat)
  TOTAL            0.65000000 SOQ (65000000 sat)

Show this to the customer:
  QR payload : soq://ln/sale-1?h=...&a=65000000
  Invoice    : soq1ln1...

Customer wallet checks the invoice:
  amount      : 0.65000000 SOQ (65000000 sat)
  signature   : VALID (post-quantum, from this merchant)
  tamper test : altered invoice rejected

Payment CONFIRMED. Receipt verified against the invoice.
Sale complete. Print receipt.
```

> This template depends on `soq-lightning-sdk` from npm, so a plain `npm install` works.

## How it works

The merchant side is one small class, `Merchant` (see `src/merchant.ts`):

```ts
import { Merchant, verifyReceipt } from "./merchant.js";

const merchant = new Merchant("Soqu Coffee");

// Ring up a sale -> a signed, post-quantum payment request.
const sale = merchant.createInvoice(65_000_000n, "Espresso, Croissant, Sticker pack");

// Show sale.qrUri (render as a QR) and sale.encoded to the customer.
// When the payment arrives, claim it; the preimage is the receipt.
const receipt = merchant.settle(sale);
```

Under the hood it wraps the Soqucoin Lightning SDK's invoice layer:

- `mlDsaKeygen()` gives the merchant a post-quantum (ML-DSA-44) identity.
- `freshPreimage()` makes a one-time secret and its payment hash (required per invoice).
- `signInvoice(...)` produces a payment request signed with a 2,420-byte Dilithium signature.
- `encodeInvoice(...)` returns the `soq1ln1...` string, and `shortInvoice(...)` returns a `soq://ln/...` URI for a QR code.
- On the customer side, `decodeInvoice(...)` and `verifyInvoice(...)` confirm the amount and that the request is genuinely from this merchant and was not altered.
- Settlement reveals the preimage as the receipt; `verifyReceipt(...)` checks it hashes to the invoice payment hash.

Amounts are always in satoshis. 1 SOQ is 100,000,000 satoshis.

## Make it yours

- Replace `CART` in `src/pos.ts` with your real products and prices.
- Render `sale.qrUri` as an actual QR code (any QR library) so a customer can scan it.
- Wire `settle()` to a real incoming payment from the SDK's channel and HTLC layer, so the sale completes when the customer actually pays.

## The honest boundary

Creating and verifying the payment request is fully real and offline, and that is the heart of a point-of-sale. The settlement step here is simulated: the merchant claims the sale directly and reveals the receipt. Real over-the-network payment from a customer's wallet to the merchant uses the SDK's channel and HTLC routing, which is built at the construction level and lights up as the forwarding endpoints ship. The verification you see (signature valid, tamper rejected, receipt matches) is genuine post-quantum cryptography.

## Why this matters

A signed payment request that a customer can verify offline is tamper-evident and quantum-safe: the amount and destination cannot be altered without breaking the signature, and the signature stays valid for decades. That is a real advantage for retail, vending, and any unattended terminal.

Build something with this and apply to the Builders League at soqu.org/build/apply.
