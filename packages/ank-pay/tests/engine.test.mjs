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
        paymentBrand: "PAYSHAP"
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
  assert.equal((await pay.listEntitlements(created.id)).length, 0);
  const verified = await pay.verifyPayment({ paymentId: created.id });
  assert.equal(verified.status, "succeeded");
  assert.ok(verified.settlementVerifiedAt);
  assert.equal(verified.entitlement.state, "sandbox_active");
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
