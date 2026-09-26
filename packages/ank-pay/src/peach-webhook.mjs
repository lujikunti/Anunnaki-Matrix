import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { AnkPayError } from "./contract.mjs";
import { mapPeachResultCode } from "./providers/peach-payshap.mjs";

function requireHex(value, name, bytes = null) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(text) || text.length % 2 !== 0 || (bytes != null && text.length !== bytes * 2)) {
    throw new AnkPayError("INVALID_WEBHOOK_CRYPTO", `${name} is not valid hexadecimal`, { httpStatus: 400 });
  }
  return text;
}
function encryptedHex(rawBody) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "");
  const trimmed = text.trim();
  if (/^[0-9a-f]+$/i.test(trimmed)) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.encryptedBody === "string") return parsed.encryptedBody.trim();
  } catch {}
  throw new AnkPayError("INVALID_WEBHOOK_BODY", "Peach webhook body must contain an encrypted hexadecimal payload.", { httpStatus: 400 });
}
export function decryptPeachPaymentsWebhook({ rawBody, secretHex, initializationVectorHex, authenticationTagHex }) {
  const key = Buffer.from(requireHex(secretHex, "webhook secret", 32), "hex");
  const ivHex = requireHex(initializationVectorHex, "initialization vector");
  const tagHex = requireHex(authenticationTagHex, "authentication tag", 16);
  const ciphertext = Buffer.from(requireHex(encryptedHex(rawBody), "encrypted body"), "hex");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext);
  } catch (cause) {
    throw new AnkPayError("WEBHOOK_DECRYPTION_FAILED", "Peach webhook authentication or decryption failed.", {
      httpStatus: 401,
      provider: "peach-payshap-sandbox",
      cause
    });
  }
}
export function verifyPeachCheckoutHmac({ rawBody, secret, timestamp, webhookId, url, receivedSignature }) {
  const message = `${timestamp}.${webhookId}.${url}.${Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "")}`;
  const expected = createHmac("sha256", String(secret ?? "")).update(message).digest("hex");
  const received = String(receivedSignature ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
export function normalizePeachWebhook(payload) {
  const payment = payload?.payload && typeof payload.payload === "object" ? payload.payload : payload;
  const providerCode = payment?.result?.code ?? null;
  const providerReference = payment?.id ?? null;
  const merchantTransactionId = payment?.merchantTransactionId ?? null;
  return {
    provider: "peach-payshap-sandbox",
    providerReference,
    merchantTransactionId,
    providerCode,
    providerDescription: payment?.result?.description ?? null,
    providerTimestamp: payment?.timestamp ?? null,
    status: mapPeachResultCode(providerCode, false),
    amount: payment?.amount ?? null,
    currency: payment?.currency ?? null,
    paymentBrand: payment?.paymentBrand ?? null,
    paymentType: payment?.paymentType ?? null,
    notificationType: payload?.type ?? "PAYMENT"
  };
}
