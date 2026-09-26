import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentProofReceipt, verifyPaymentProofReceipt } from "../src/index.mjs";

test("creates tamper-evident payment Proof receipt without payer credentials", () => {
  const payment = {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "peach-payshap-sandbox",
    providerReference: "41a57893d4a44191be8cd410398464e6",
    merchantTransactionId: "AP12345678901234",
    reference: "MN-family-001",
    amountMinor: 25000,
    currency: "ZAR",
    productKey: "mn-family-monthly",
    subject: { type: "family", id: "family-001" },
    status: "succeeded",
    statusVerifiedAt: "2026-09-26T03:00:00.000Z",
    settlementVerifiedAt: "2026-09-26T03:00:00.000Z"
  };
  const receipt = createPaymentProofReceipt({
    payment,
    events: [{ type: "provider.verified", status: "succeeded", providerCode: "000.000.000" }],
    entitlement: { id: "e1", state: "sandbox_active", productKey: payment.productKey, subject: payment.subject, grantedAt: "2026-09-26T03:00:01.000Z" },
    verification: { providerCode: "000.000.000", paymentBrand: "PAYSHAP" },
    clock: () => new Date("2026-09-26T03:00:02.000Z")
  });
  assert.match(receipt.id, /^payr_[0-9a-f]{24}$/);
  assert.match(receipt.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(verifyPaymentProofReceipt(receipt), true);
  assert.equal(receipt.content.rules.webhookIsSettlementProof, false);
  assert.equal(JSON.stringify(receipt).includes("0711111200"), false);
  const tampered = structuredClone(receipt);
  tampered.content.amountMinor = 1;
  assert.equal(verifyPaymentProofReceipt(tampered), false);
});
