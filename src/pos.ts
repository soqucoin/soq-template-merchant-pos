// Demo: a coffee shop point-of-sale on Soqucoin Lightning.
//
//   npm start
//
// Fully offline. The merchant rings up a cart, signs a post-quantum payment
// request, the customer's wallet verifies it is genuine and unaltered, and the
// sale settles with a verifiable receipt. Replace the cart and the simulated
// settlement with your real checkout and the SDK's channel/HTLC layer.

import { decodeInvoice, verifyInvoice, nobleMlDsa } from "soq-lightning-sdk";
import { Merchant, verifyReceipt, type Sale } from "./merchant.js";

const SOQ = 100_000_000n; // 1 SOQ in satoshis

// A simple cart. Prices in satoshis.
const CART = [
  { item: "Espresso", priceSat: 30_000_000n }, // 0.30 SOQ
  { item: "Croissant", priceSat: 25_000_000n }, // 0.25 SOQ
  { item: "Sticker pack", priceSat: 10_000_000n }, // 0.10 SOQ
];

function fmt(sat: bigint): string {
  return `${(Number(sat) / Number(SOQ)).toFixed(8)} SOQ (${sat} sat)`;
}

// Customer side: decode and cryptographically verify the merchant's invoice.
function customerInspect(encoded: string, merchantPubKey: Uint8Array) {
  const inv = decodeInvoice(encoded);
  const valid = verifyInvoice(inv, merchantPubKey, nobleMlDsa);
  return { amountSat: inv.amountSat, description: inv.description, valid };
}

// Stand-in for the network settling the invoice. In production the customer pays
// an HTLC locked to the sale's payment hash; the merchant claims it. Here the
// merchant settles directly and hands back the receipt (preimage).
function networkPayAndSettle(merchant: Merchant, sale: Sale): Uint8Array {
  return merchant.settle(sale);
}

function main(): void {
  const merchant = new Merchant("Soqu Coffee");
  console.log(`${merchant.name} point-of-sale\n`);

  // 1. Ring up the cart.
  const total = CART.reduce((s, l) => s + l.priceSat, 0n);
  for (const line of CART) console.log(`  ${line.item.padEnd(16)} ${fmt(line.priceSat)}`);
  console.log(`  ${"TOTAL".padEnd(16)} ${fmt(total)}\n`);

  // 2. Merchant creates a signed, post-quantum payment request.
  const sale = merchant.createInvoice(total, CART.map((l) => l.item).join(", "));
  console.log("Show this to the customer:");
  console.log(`  QR payload : ${sale.qrUri}`);
  console.log(`  Invoice    : ${sale.encoded.slice(0, 48)}...\n`);

  // 3. Customer's wallet decodes and verifies it is genuine and unaltered.
  const seen = customerInspect(sale.encoded, merchant.publicKey);
  console.log("Customer wallet checks the invoice:");
  console.log(`  amount      : ${fmt(seen.amountSat)}`);
  console.log(`  signature   : ${seen.valid ? "VALID (post-quantum, from this merchant)" : "INVALID"}`);
  if (!seen.valid) throw new Error("invoice failed verification");

  // Tamper check: a single altered character must break the invoice.
  const tampered = sale.encoded.slice(0, -1) + (sale.encoded.endsWith("q") ? "p" : "q");
  let tamperRejected: boolean;
  try {
    tamperRejected = !customerInspect(tampered, merchant.publicKey).valid;
  } catch {
    tamperRejected = true;
  }
  console.log(`  tamper test : ${tamperRejected ? "altered invoice rejected" : "WARNING not rejected"}\n`);

  // 4. Settlement. The receipt (preimage) must hash to the invoice payment hash.
  const receipt = networkPayAndSettle(merchant, sale);
  const paid = verifyReceipt(sale.paymentHash, receipt);
  console.log(`Payment ${paid ? "CONFIRMED" : "FAILED"}. Receipt verified against the invoice.`);
  console.log(paid ? "Sale complete. Print receipt.\n" : "\n");

  console.log("Next: render the QR payload as a scannable code and wire real settlement");
  console.log("through the SDK's channel and HTLC layer (see README).");
}

main();
