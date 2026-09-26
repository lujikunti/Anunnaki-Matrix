import test from "node:test";
import assert from "node:assert/strict";
import { createAnkPay, createMemoryLedger, AnkPayError } from "../src/index.mjs";

function makeProvider({ createStatus = "pending", verifyStatus = "succeeded", verifyOverrides = {} } = {}) {
  let creates = 0;
  let verifies = 0;
  return {
    id: "fake-provider",
    capabilities: { paymentRequest: true, statusQuery: true },
    get counts() { return { creates, verifies }; },
    async createPaymentRequest() {
      creates += 1;
      return {
        provider: "fake-provider",
        providerReference: "a".repeat(32),
        merchantTransactionId: "AP12345678901234",
        status: createStatus,
        providerCode: createStatus === "succeeded" ? "000.100.110" : "000.200.000",
        amountMinor: 25000,
        currency: "ZAR",
        paymentBrand: "PAYSHAP",
        action: { type: "redirect", url: "https://sandbox.example/continue", method: "GET", fields: [] }
      };
    },
    async getPaymentStatus() {
      verifies += 1;
      return {
        provider: "fake-provider",
        providerReference: "a".repeat(32),
        merchantTransactionId: "AP12345678901234",
        status: verifyStatus,
        providerCode: verifyStatus === "succeeded" ? "000.000.000" : "100.396.101",
        amountMinor: 25000,
        currency: "ZAR",
        paymentBrand: "PAYSHAP",
        ...verifyOverrides
      };
    }
  };
}

const intent = {
  idempotencyKey: "idem-family-001-202609",
  productKey: "mn-family-monthly",
  subject: { type: "family", id: "family-001" },
  amountMinor: 25000,
  currency: "ZAR",
  reference: "MN-family-001-september",
  returnUrl: "https://example.com/payments/return",
  payer: { bank: "FNB", cellphone: "0711111200" }
};

test("idempotent replay never creates a second provider payment", async () => {
  const provider = makeProvider();
  const pay = createAnkPay({ provider, ledger: createMemoryLedger() });
  const first = await pay.createPayment(intent);
  const replay = await pay.createPayment(intent);
  assert.equal(first.id, replay.id);
  assert.equal(replay.replayed, true);
  assert.equal(replay.action?.type, "redirect");
  assert.equal(provider.counts.creates, 1);
});

test("same idempotency key with a different intent is rejected", async () => {
  const pay = createAnkPay({ provider: makeProvider(), ledger: createMemoryLedger() });
  await pay.createPayment(intent);
  await assert.rejects(
    () => pay.createPayment({ ...intent, amountMinor: 26000 }),
    (error) => error instanceof AnkPayError && error.code === "IDEMPOTENCY_CONFLICT"
  );
});

test("provider create success is not settlement until independently verified", async () => {
  const provider = makeProvider({ createStatus: "succeeded", verifyStatus: "succeeded" });
  const pay = createAnkPay({ provider, ledger: createMemoryLedger() });
  const created = await pay.createPayment(intent);
  assert.equal(created.status, "awaiting_verification");
  assert.equal(created.settlementVerifiedAt, null);
  assert.equal(created.action?.type, "redirect");
  assert.equal((await pay.listEntitlements(created.id)).length, 0);
  const verified = await pay.verifyPayment({ paymentId: created.id });
  assert.equal(verified.status, "succeeded");
  assert.ok(verified.settlementVerifiedAt);
  assert.equal(verified.entitlement.state, "sandbox_active");
  assert.equal(verified.receipt.content.paymentStatus, "succeeded");
  assert.match(verified.receipt.contentHash, /^[0-9a-f]{64}$/);
  assert.equal((await pay.listReceipts(created.id)).length, 1);
  assert.equal(provider.counts.verifies, 1);
});

test("webhook hint cannot grant entitlement", async () => {
  const pay = createAnkPay({ provider: makeProvider(), ledger: createMemoryLedger() });
  const created = await pay.createPayment(intent);
  const hinted = await pay.recordWebhookHint({ paymentId: created.id, providerStatus: "succeeded", providerCode: "000.000.000" });
  assert.equal(hinted.status, "awaiting_verification");
  assert.equal((await pay.listEntitlements(created.id)).length, 0);
});

test("verification mismatch blocks settlement and entitlement", async () => {
  const pay = createAnkPay({
    provider: makeProvider({ verifyStatus: "succeeded", verifyOverrides: { amountMinor: 99900 } }),
    ledger: createMemoryLedger()
  });
  const created = await pay.createPayment(intent);
  const verified = await pay.verifyPayment({ paymentId: created.id });
  assert.equal(verified.status, "verification_failed");
  assert.equal((await pay.listEntitlements(created.id)).length, 0);
});

test("verified failed state can later become succeeded, matching Peach webhook semantics", async () => {
  let status = "failed";
  const provider = makeProvider();
  provider.getPaymentStatus = async () => ({
    provider: "fake-provider", providerReference: "a".repeat(32), merchantTransactionId: "AP12345678901234",
    status, providerCode: status === "succeeded" ? "000.000.000" : "100.396.101",
    amountMinor: 25000, currency: "ZAR", paymentBrand: "PAYSHAP"
  });
  const pay = createAnkPay({ provider, ledger: createMemoryLedger() });
  const created = await pay.createPayment(intent);
  const failed = await pay.verifyPayment({ paymentId: created.id });
  assert.equal(failed.status, "failed");
  status = "succeeded";
  const succeeded = await pay.verifyPayment({ paymentId: created.id });
  assert.equal(succeeded.status, "succeeded");
  assert.equal((await pay.listEntitlements(created.id)).length, 1);
});


test("authenticated webhook hint triggers independent provider verification before access", async () => {
  const provider = makeProvider({ verifyStatus: "succeeded" });
  const pay = createAnkPay({ provider, ledger: createMemoryLedger() });
  const created = await pay.createPayment(intent);
  const result = await pay.processWebhookHint({
    webhookId: "wh-001",
    rawHash: "a".repeat(64),
    normalized: {
      providerReference: created.providerReference,
      merchantTransactionId: created.merchantTransactionId,
      providerCode: "000.000.000",
      providerTimestamp: "2026-09-26T03:00:00Z",
      status: "succeeded",
      paymentBrand: "PAYSHAP",
      paymentType: "DB",
      amount: "250.00",
      currency: "ZAR",
      notificationType: "PAYMENT"
    }
  });
  assert.equal(provider.counts.verifies, 1);
  assert.equal(result.status, "succeeded");
  assert.equal(result.entitlement.state, "sandbox_active");
  assert.ok(result.receipt);
});

test("reconciliation snapshot surfaces settlements, receipts and open issues", async () => {
  const pay = createAnkPay({ provider: makeProvider({ verifyStatus: "succeeded" }), ledger: createMemoryLedger() });
  const created = await pay.createPayment(intent);
  await pay.verifyPayment({ paymentId: created.id });
  const snapshot = await pay.reconciliationSnapshot();
  assert.equal(snapshot.totals.payments, 1);
  assert.equal(snapshot.totals.succeeded, 1);
  assert.equal(snapshot.totals.receipts, 1);
  assert.equal(snapshot.rows[0].entitlements[0].state, "sandbox_active");
});
