import test from "node:test";
import assert from "node:assert/strict";
import {
  createPeachPayShapSandboxAdapter,
  merchantTransactionId,
  normalizeZaCellphone,
  mapPeachResultCode,
  AnkPayError
} from "../src/index.mjs";

const env = {
  PEACH_SANDBOX_ENTITY_ID: "8ac7a4c894809722019482d1df62029d",
  PEACH_SANDBOX_USER_ID: "5fb5e392d6fa11ef9b3002f694e28f55",
  PEACH_SANDBOX_PASSWORD: "test-password"
};

test("normalises South African cellphone numbers", () => {
  assert.equal(normalizeZaCellphone("071 111 1200"), "+27-711111200");
  assert.equal(normalizeZaCellphone("+27711111200"), "+27-711111200");
  assert.equal(normalizeZaCellphone("+27-711111200"), "+27-711111200");
});

test("rejects unsupported cellphone formats", () => {
  assert.throws(() => normalizeZaCellphone("123"), (error) => error instanceof AnkPayError && error.code === "INVALID_CELLPHONE");
});

test("creates deterministic 16-character Peach reconciliation ids", () => {
  const a = merchantTransactionId("idem-family-001-202609");
  const b = merchantTransactionId("idem-family-001-202609");
  assert.equal(a, b);
  assert.match(a, /^[A-Z0-9]{16}$/);
});

test("maps documented simulator and general successful result codes", () => {
  assert.equal(mapPeachResultCode("000.100.110"), "succeeded");
  assert.equal(mapPeachResultCode("000.000.000"), "succeeded");
  assert.equal(mapPeachResultCode("100.396.101"), "failed");
  assert.equal(mapPeachResultCode("100.396.104"), "expired");
  assert.equal(mapPeachResultCode("900.100.100"), "failed");
  assert.equal(mapPeachResultCode("777.777.777"), "unknown");
});

test("Peach adapter constructs sandbox PayShap and normalises verification fields", async () => {
  const responses = [
    {
      id: "41a57893d4a44191be8cd410398464e6",
      merchantTransactionId: merchantTransactionId("idem-family-001-202609"),
      paymentBrand: "PAYSHAP", paymentType: "DB", amount: "250.00", currency: "ZAR",
      result: { code: "000.100.110", description: "sandbox success" }
    },
    {
      id: "41a57893d4a44191be8cd410398464e6",
      merchantTransactionId: merchantTransactionId("idem-family-001-202609"),
      paymentBrand: "PAYSHAP", paymentType: "DB", amount: "250.00", currency: "ZAR",
      result: { code: "000.000.000", description: "verified success" }
    }
  ];
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : null });
    return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
  };
  const adapter = createPeachPayShapSandboxAdapter({ fetchImpl, env });
  const input = {
    idempotencyKey: "idem-family-001-202609",
    amountMinor: 25000, currency: "ZAR", reference: "MN-family-001-september",
    returnUrl: "https://example.com/payments/return", payer: { bank: "FNB", cellphone: "0711111200" }
  };
  const created = await adapter.createPaymentRequest(input);
  assert.equal(calls[0].url, "https://testapi-v2.peachpayments.com/payments");
  assert.equal(calls[0].body.paymentBrand, "PAYSHAP");
  assert.equal(calls[0].body.amount, "250.00");
  assert.equal(calls[0].body.virtualAccount.accountId, "+27-711111200");
  assert.equal(calls[0].body["customParameters[enableTestMode]"], "true");
  assert.equal(created.amountMinor, 25000);
  const verified = await adapter.getPaymentStatus({ providerReference: created.providerReference });
  assert.equal(verified.amountMinor, 25000);
  assert.equal(verified.currency, "ZAR");
  assert.equal(verified.paymentBrand, "PAYSHAP");
});

test("adapter refuses any non-sandbox endpoint", () => {
  assert.throws(
    () => createPeachPayShapSandboxAdapter({ baseUrl: "https://api-v2.peachpayments.com", env }),
    (error) => error instanceof AnkPayError && error.code === "SANDBOX_ONLY"
  );
});
