import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import {
  AnkPayError,
  decryptPeachPaymentsWebhook,
  normalizePeachWebhook,
  verifyPeachCheckoutHmac
} from "../src/index.mjs";

function encrypt(payload) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    secretHex: key.toString("hex"),
    initializationVectorHex: iv.toString("hex"),
    authenticationTagHex: cipher.getAuthTag().toString("hex"),
    encryptedHex: ciphertext.toString("hex")
  };
}

test("decrypts authenticated Peach Payments API webhook and normalises reconciliation fields", () => {
  const payload = {
    type: "PAYMENT",
    payload: {
      id: "41a57893d4a44191be8cd410398464e6",
      merchantTransactionId: "AP12345678901234",
      paymentBrand: "PAYSHAP",
      paymentType: "DB",
      amount: "250.00",
      currency: "ZAR",
      result: { code: "000.000.000", description: "success" },
      timestamp: "2026-09-26T03:00:00Z"
    }
  };
  const crypt = encrypt(payload);
  const decoded = decryptPeachPaymentsWebhook({ rawBody: crypt.encryptedHex, ...crypt });
  assert.deepEqual(decoded, payload);
  const normalized = normalizePeachWebhook(decoded);
  assert.equal(normalized.providerReference, payload.payload.id);
  assert.equal(normalized.merchantTransactionId, "AP12345678901234");
  assert.equal(normalized.status, "succeeded");
  assert.equal(normalized.paymentBrand, "PAYSHAP");
});

test("supports Peach JSON encryptedBody wrapper without storing plaintext", () => {
  const crypt = encrypt({ type: "PAYMENT", payload: { result: { code: "000.200.000" } } });
  const decoded = decryptPeachPaymentsWebhook({ rawBody: JSON.stringify({ encryptedBody: crypt.encryptedHex }), ...crypt });
  assert.equal(decoded.type, "PAYMENT");
});

test("rejects tampered authenticated webhook", () => {
  const crypt = encrypt({ type: "PAYMENT", payload: { id: "x" } });
  const badTag = (crypt.authenticationTagHex[0] === "0" ? "1" : "0") + crypt.authenticationTagHex.slice(1);
  assert.throws(
    () => decryptPeachPaymentsWebhook({ rawBody: crypt.encryptedHex, ...crypt, authenticationTagHex: badTag }),
    (error) => error instanceof AnkPayError && error.code === "WEBHOOK_DECRYPTION_FAILED"
  );
});

test("verifies Peach Checkout HMAC using raw body, timestamp, webhook id and exact URL", () => {
  const secret = "sandbox-webhook-secret";
  const rawBody = "amount=1.00&currency=ZAR&paymentBrand=PAYSHAP";
  const timestamp = "1790390000";
  const webhookId = "wh_123";
  const url = "https://example.com/api/ank-pay/webhook";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${webhookId}.${url}.${rawBody}`).digest("hex");
  assert.equal(verifyPeachCheckoutHmac({ rawBody, secret, timestamp, webhookId, url, receivedSignature: signature }), true);
  assert.equal(verifyPeachCheckoutHmac({ rawBody: rawBody + "x", secret, timestamp, webhookId, url, receivedSignature: signature }), false);
});
