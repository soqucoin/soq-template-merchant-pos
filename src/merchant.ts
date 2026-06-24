// Merchant
// --------
// The merchant side of a point-of-sale: ring up a sale and produce a signed,
// post-quantum payment request the customer can verify and pay. When the payment
// arrives, the merchant claims it and reveals the preimage, which is the receipt.
//
// Everything here is client-side cryptography. No network is required to create
// or verify an invoice, which is exactly what a point-of-sale needs.

import {
  mlDsaKeygen,
  signInvoice,
  encodeInvoice,
  freshPreimage,
  nobleMlDsa,
  shortInvoice,
} from "soq-lightning-sdk";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const sha256 = (b: Uint8Array): Uint8Array => new Uint8Array(createHash("sha256").update(b).digest());
const rng = (n: number): Uint8Array => new Uint8Array(randomBytes(n));

export interface Sale {
  id: string;
  description: string;
  amountSat: bigint;
  /** soq1ln1... payment request to print or send to the customer. */
  encoded: string;
  /** soq://ln/... payload to render as a QR code at the till. */
  qrUri: string;
  /** Public 32-byte hash that the payment is locked to. */
  paymentHash: Uint8Array;
  /** Merchant-only secret. Revealing it claims the payment and proves receipt. */
  preimage: Uint8Array;
}

export class Merchant {
  readonly name: string;
  /** ML-DSA-44 (post-quantum) public key. Customers verify invoices against this. */
  readonly publicKey: Uint8Array;
  private readonly secretKey: Uint8Array;
  private readonly destination: Uint8Array;
  private seq = 0;

  constructor(name = "Merchant") {
    const w = mlDsaKeygen();
    this.name = name;
    this.publicKey = w.publicKey;
    this.secretKey = w.secretKey;
    this.destination = sha256(w.publicKey);
  }

  /** Ring up a sale: a signed, post-quantum payment request to show the customer. */
  createInvoice(amountSat: bigint, description: string, expirySec = 900): Sale {
    const { preimage, paymentHash } = freshPreimage(rng);
    const id = `sale-${++this.seq}`;
    const invoice = signInvoice(
      {
        version: 1,
        amountSat,
        paymentHash,
        destination: this.destination,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        expiry: expirySec,
        description,
        metadata: new Uint8Array(),
      },
      this.secretKey,
      nobleMlDsa,
    );
    return {
      id,
      description,
      amountSat,
      encoded: encodeInvoice(invoice),
      qrUri: shortInvoice(id, paymentHash, amountSat),
      paymentHash,
      preimage,
    };
  }

  /**
   * Claim an arrived payment and return the preimage, which is the receipt.
   * In a live network this is triggered by the incoming HTLC locked to the
   * sale's payment hash. Here it is a direct call; see the README for wiring it
   * to the SDK's channel and HTLC layer.
   */
  settle(sale: Sale): Uint8Array {
    return sale.preimage;
  }
}

/**
 * Customer-side proof of payment. The receipt (preimage) the customer receives
 * must hash to the invoice's payment hash. This is the real Lightning settlement
 * proof, and it runs offline.
 */
export function verifyReceipt(paymentHash: Uint8Array, preimage: Uint8Array): boolean {
  const h = sha256(preimage);
  return h.length === paymentHash.length && timingSafeEqual(h, paymentHash);
}
