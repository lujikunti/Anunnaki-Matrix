export const ANK_PAY_STATUSES = Object.freeze([
  "created",
  "pending",
  "succeeded",
  "failed",
  "expired",
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

  const reference = String(input.reference ?? "").trim();
  if (reference.length < 3 || reference.length > 120) {
    throw new AnkPayError("INVALID_REFERENCE", "reference must contain 3 to 120 characters.", { httpStatus: 400 });
  }

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
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}
