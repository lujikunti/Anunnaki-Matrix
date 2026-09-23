import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnkPay,
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

test("creates deterministic Peach reconciliation ids", () => {
  const a = merchantTransactionId("MN-family-001-september");
  const b = merchantTransactionId("MN-family-001-september");
  assert.equal(a, b);
  assert.match(a, /^[A-Z0-9]{16}$/);
});

test("maps simulator result codes without treating unknown states as success", () => {
  assert.equal(mapPeachResultCode("000.100.110"), "succeeded");
  assert.equal(mapPeachResultCode("100.396.101"), "failed");
  assert.equal(mapPeachResultCode("100.396.104"), "expired");
  assert.equal(mapPeachResultCode("900.100.100"), "failed");
  assert.equal(mapPeachResultCode("777.777.777"), "unknown");
});

test("ANK Pay caller contract is provider-neutral", async () => {
  const calls = [];
  const provider = {
    id: "future-stitch-adapter",
    capabilities: { paymentRequest: true },
    async createPaymentRequest(input) { calls.push(input); return { provider: this.id, status: "pending" }; },
    async getPaymentStatus() { return { provider: this.id, status: "succeeded" }; }
  };
  const ankPay = createAnkPay({ provider });
  const result = await ankPay.createPaymentRequest({ hello: "world" });
  assert.equal(ankPay.providerId, "future-stitch-adapter");
  assert.equal(result.status, "pending");
  assert.deepEqual(calls, [{ hello: "world" }]);
});

test("Peach adapter constructs the documented sandbox PayShap request", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      id: "41a57893d4a44191be8cd410398464e6",
      merchantTransactionId: "APABCDEF123456",
      result: { code: "000.100.110", description: "sandbox success" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const ankPay = createAnkPay({ provider: createPeachPayShapSandboxAdapter({ fetchImpl, env }) });
  const result = await ankPay.createPaymentRequest({
    amountMinor: 25000,
    currency: "ZAR",
    reference: "MN-family-001-september",
    returnUrl: "https://example.com/payments/return",
    payer: { bank: "FNB", cellphone: "0711111200" }
  });

  assert.equal(captured.url, "https://testapi-v2.peachpayments.com/payments");
  assert.equal(captured.body.paymentBrand, "PAYSHAP");
  assert.equal(captured.body.paymentType, "DB");
  assert.equal(captured.body.amount, "250.00");
  assert.equal(captured.body.currency, "ZAR");
  assert.equal(captured.body.virtualAccount.bank, "FIRSTNATIONALBANK");
  assert.equal(captured.body.virtualAccount.type, "CELLPHONE");
  assert.equal(captured.body.virtualAccount.accountId, "+27-711111200");
  assert.equal(captured.body["customParameters[enableTestMode]"], "true");
  assert.equal(result.status, "succeeded");
});

test("v0.1 adapter refuses any non-sandbox endpoint", () => {
  assert.throws(
    () => createPeachPayShapSandboxAdapter({ baseUrl: "https://api-v2.peachpayments.com", env }),
    (error) => error instanceof AnkPayError && error.code === "SANDBOX_ONLY"
  );
});
