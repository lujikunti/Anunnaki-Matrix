import { createHash, randomUUID } from "node:crypto";

export const ANK_PAY_STATUSES = Object.freeze([
  "created",
  "pending",
  "awaiting_verification",
  "succeeded",
  "failed",
  "expired",
  "verification_failed",
  "unknown"
]);

export class AnkPayError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AnkPayError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 500;
    this.provider = options.provider ?? null;
    this.providerCode = options.providerCode ?? null;
  }
}

export function assertProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new AnkPayError("INVALID_PROVIDER", "ANK Pay provider adapter is required.", { httpStatus: 500 });
  }
  for (const method of ["createPaymentRequest", "getPaymentStatus"]) {
    if (typeof adapter[method] !== "function") {
      throw new AnkPayError("INVALID_PROVIDER", `Provider adapter must implement ${method}().`, { httpStatus: 500 });
    }
  }
  if (!adapter.id || typeof adapter.id !== "string") {
    throw new AnkPayError("INVALID_PROVIDER", "Provider adapter must expose a stable id.", { httpStatus: 500 });
  }
  return adapter;
}

function requireToken(value, name, min = 3, max = 160) {
  const token = String(value ?? "").trim();
  if (token.length < min || token.length > max) {
    throw new AnkPayError(`INVALID_${name.toUpperCase()}`, `${name} must contain ${min} to ${max} characters.`, { httpStatus: 400 });
  }
  return token;
}

export function validatePaymentRequest(input) {
  if (!input || typeof input !== "object") {
    throw new AnkPayError("INVALID_REQUEST", "Payment request body is required.", { httpStatus: 400 });
  }

  const amountMinor = Number(input.amountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new AnkPayError("INVALID_AMOUNT", "amountMinor must be a positive integer.", { httpStatus: 400 });
  }

  const currency = String(input.currency ?? "ZAR").toUpperCase();
  if (currency !== "ZAR") {
    throw new AnkPayError("UNSUPPORTED_CURRENCY", "The PayShap prototype supports ZAR only.", { httpStatus: 400 });
  }

  const reference = requireToken(input.reference, "reference", 3, 120);
  const returnUrl = String(input.returnUrl ?? "").trim();
  let parsed;
  try {
    parsed = new URL(returnUrl);
  } catch {
    throw new AnkPayError("INVALID_RETURN_URL", "returnUrl must be a valid HTTPS URL.", { httpStatus: 400 });
  }
  if (parsed.protocol !== "https:") {
    throw new AnkPayError("INVALID_RETURN_URL", "returnUrl must use HTTPS.", { httpStatus: 400 });
  }

  const payer = input.payer ?? {};
  return {
    amountMinor,
    currency,
    reference,
    returnUrl,
    payer: {
      bank: String(payer.bank ?? "").trim().toUpperCase(),
      cellphone: String(payer.cellphone ?? "").trim()
    },
    idempotencyKey: input.idempotencyKey ? requireToken(input.idempotencyKey, "idempotencyKey", 8, 160) : undefined,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

export function validatePaymentIntent(input) {
  const request = validatePaymentRequest(input);
  const idempotencyKey = requireToken(input.idempotencyKey, "idempotencyKey", 8, 160);
  const productKey = requireToken(input.productKey, "productKey", 2, 120);
  const subject = input.subject ?? {};
  const subjectType = requireToken(subject.type, "subjectType", 2, 40);
  const subjectId = requireToken(subject.id, "subjectId", 2, 160);
  return { ...request, idempotencyKey, productKey, subject: { type: subjectType, id: subjectId } };
}

export function paymentIntentFingerprint(intent, providerId) {
  const normalized = JSON.stringify({
    providerId,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    reference: intent.reference,
    productKey: intent.productKey,
    subject: intent.subject,
    payerBank: intent.payer.bank,
    payerFingerprint: createHash("sha256").update(String(intent.payer.cellphone)).digest("hex")
  });
  return createHash("sha256").update(normalized).digest("hex");
}

export function newPaymentId() {
  return randomUUID();
}
