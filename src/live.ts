// Live demo: get PAID on stagenet Lightning.
//
//   LSP_URL=https://lsp.soqu.org npm run live
//
// The offline demo (npm start) shows the post-quantum invoice cryptography.
// This one moves real stagenet value: the merchant opens a channel with the
// hosted LSP, creates an LSP invoice for the cart, and a customer channel pays
// it — the merchant's channel balance grows when it settles.
//
// These are LSP invoices (custodial receive: the hub atomically debits the
// payer and credits the merchant — hosted beta). The PQ-signed soq1ln1…
// invoices in the offline demo are the trust-minimized target; this API keeps
// its shape when that rail lands.

import { SoqLightning, mlDsaKeygen, onchain } from "soq-lightning-sdk";

const LSP_URL = process.env.LSP_URL;
if (!LSP_URL) {
  console.error("Set LSP_URL (e.g. LSP_URL=https://lsp.soqu.org npm run live)");
  process.exit(1);
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const SOQ = 100_000_000;
const fmt = (sat: number) => `${(sat / SOQ).toFixed(4)} SOQ`;

async function main(): Promise<void> {
  const ln = new SoqLightning({ baseUrl: LSP_URL! });

  // Two ephemeral stagenet identities: the till and a customer.
  const till = mlDsaKeygen();
  const customer = mlDsaKeygen();

  // Plain hosted opens (no faucet): instant and repeatable — the stagenet
  // faucet rate-limits to one drip per IP per 10 minutes, which a two-channel
  // demo would trip every run. Use ln.fundAndOpen() instead when you want a
  // channel backed by a real faucet drip.
  console.log("1. Opening channels with the LSP…");
  const merchantCh = await ln.openChannel({
    pubKeyHex: hex(till.publicKey),
    address: onchain.deriveAddress(till.publicKey), // real ssq1p… settlement address
    capacitySat: 50_000_000, // 0.5 SOQ
    name: "pos-merchant",
  });
  const customerCh = await ln.openChannel({
    pubKeyHex: hex(customer.publicKey),
    address: onchain.deriveAddress(customer.publicKey),
    capacitySat: 50_000_000,
    name: "pos-customer",
  });
  console.log(`   merchant channel ${merchantCh.channel_id.slice(0, 16)}… (${fmt(merchantCh.initiator_balance_sat)})`);
  console.log(`   customer channel ${customerCh.channel_id.slice(0, 16)}… (${fmt(customerCh.initiator_balance_sat)})`);

  // 2. Ring up the cart and create the invoice.
  const totalSat = 6_500_000; // 0.065 SOQ — espresso + croissant
  console.log(`\n2. Ringing up ${fmt(totalSat)} → creating an LSP invoice…`);
  const inv = await ln.createInvoice(merchantCh.channel_id, totalSat, {
    memo: "Espresso, Croissant",
  });
  console.log(`   ${inv.uri}`);
  console.log("   (render this as a QR at the till — SoquShield's Pay tab can settle it)");

  // 3. The customer pays it. In real life this is a different device scanning
  //    the QR; parseInvoiceUri gets the id back out of the scanned string.
  console.log("\n3. Customer pays the invoice…");
  const id = SoqLightning.parseInvoiceUri(inv.uri)!;
  await ln.payInvoice(id, customerCh.channel_id);

  // 4. The merchant's poll sees it settle; the channel balance grew.
  const settled = await ln.awaitInvoicePaid(inv.invoice_id, { timeoutMs: 30_000 });
  const after = await ln.channel(merchantCh.channel_id);
  console.log(`   invoice: ${settled.status}`);
  console.log(`   merchant balance: ${fmt(after.initiator_balance_sat)} (was ${fmt(merchantCh.initiator_balance_sat)})`);

  if (settled.status !== "paid") throw new Error("invoice did not settle");
  if (after.initiator_balance_sat !== merchantCh.initiator_balance_sat + totalSat)
    throw new Error("merchant balance did not grow by the sale amount");

  console.log("\n✅ Sale settled on stagenet Lightning — the merchant got paid.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
