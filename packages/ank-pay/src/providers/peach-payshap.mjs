import { createHash } from "node:crypto";
import { AnkPayError, validatePaymentRequest } from "../contract.mjs";

export const PEACH_PAYSHAP_SANDBOX_BASE_URL = "https://testapi-v2.peachpayments.com";
export const PEACH_PAYSHAP_TEST_NUMBERS = Object.freeze({
  success: "+27-711111200",
  declined: "+27-711111160",
  expired: "+27-711111140",
  connectorError: "+27-711111107"
});

export const PEACH_PAYSHAP_BANKS = Object.freeze({
  FNB: "FIRSTNATIONALBANK",
  FIRSTNATIONALBANK: "FIRSTNATIONALBANK",
  DISCOVERY: "DISCOVERYBANK",
  DISCOVERYBANK: "DISCOVERYBANK",
  NEDBANK: "NEDBANK",
  TYMEBANK: "TYMEBANK",
  ABSA: "ABSABANK",
  ABSABANK: "ABSABANK"
});

function credentialsFromEnv(env = process.env) {
  const credentials = {
    entityId: env.PEACH_SANDBOX_ENTITY_ID,
    userId: env.PEACH_SANDBOX_USER_ID,
    password: env.PEACH_SANDBOX_PASSWORD
  };
  const missing = Object.entries(credentials).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new AnkPayError(
      "PROVIDER_NOT_CONFIGURED",
      `Peach sandbox credentials are missing: ${missing.join(", ")}.`,
      { httpStatus: 503, provider: "peach-payshap-sandbox" }
    );
  }
  return credentials;
}

export function normalizeZaCellphone(input) {
  const compact = String(input ?? "").replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(compact)) return `+27-${compact.slice(1)}`;
  if (/^\+27\d{9}$/.test(compact)) return `+27-${compact.slice(3)}`;
  if (/^\+27-\d{9}$/.test(compact)) return compact;
  throw new AnkPayError(
    "INVALID_CELLPHONE",
    "cellphone must be a South African number such as 0712345678 or +27-712345678.",
    { httpStatus: 400, provider: "peach-payshap-sandbox" }
  );
}

export function mapPeachBank(bank) {
  const mapped = PEACH_PAYSHAP_BANKS[String(bank ?? "").toUpperCase()];
  if (!mapped) {
    throw new AnkPayError(
      "UNSUPPORTED_BANK",
      "Peach PayShap sandbox prototype supports Absa, Discovery Bank, FNB, Nedbank and TymeBank.",
      { httpStatus: 400, provider: "peach-payshap-sandbox" }
    );
  }
  return mapped;
}

export function merchantTransactionId(reference) {
  const digest = createHash("sha256").update(String(reference)).digest("hex").slice(0, 14).toUpperCase();
  return `AP${digest}`;
}

export function mapPeachResultCode(code, hasRedirect = false) {
  if (/^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.[12]10)/.test(code ?? "")) return "succeeded";
  if (code === "100.396.104" || code === "100.380.501") return "expired";
  if (code === "100.396.101" || /^800\./.test(code ?? "") || /^900\./.test(code ?? "")) return "failed";
  if (hasRedirect || code === "000.200.000") return "pending";
  return "unknown";
}

function moneyToMinor(amount) {
  if (amount == null || amount === "") return null;
  const number = Number(amount);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

function normalizePeachResponse(raw, fallbackMerchantTransactionId) {
  const redirect = raw?.redirect?.url ? {
    type: "redirect",
    url: raw.redirect.url,
    method: String(raw.redirect.method ?? "GET").toUpperCase(),
    fields: raw.redirect.parameters ?? []
  } : null;
  const providerCode = raw?.result?.code ?? null;
  return {
    provider: "peach-payshap-sandbox",
    providerReference: raw?.id ?? null,
    merchantTransactionId: raw?.merchantTransactionId ?? fallbackMerchantTransactionId,
    status: mapPeachResultCode(providerCode, Boolean(redirect)),
    providerCode,
    providerDescription: raw?.result?.description ?? null,
    providerTimestamp: raw?.timestamp ?? null,
    amountMinor: moneyToMinor(raw?.amount),
    currency: raw?.currency ?? null,
    paymentBrand: raw?.paymentBrand ?? null,
    paymentType: raw?.paymentType ?? null,
    action: redirect
  };
}

export function createPeachPayShapSandboxAdapter(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const baseUrl = options.baseUrl ?? PEACH_PAYSHAP_SANDBOX_BASE_URL;
  if (baseUrl !== PEACH_PAYSHAP_SANDBOX_BASE_URL) {
    throw new AnkPayError(
      "SANDBOX_ONLY",
      "The ANK Pay Peach prototype is intentionally locked to the official sandbox endpoint.",
      { httpStatus: 500, provider: "peach-payshap-sandbox" }
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new AnkPayError("FETCH_UNAVAILABLE", "A fetch implementation is required.", { httpStatus: 500 });
  }

  return {
    id: "peach-payshap-sandbox",
    capabilities: Object.freeze({
      paymentRequest: true,
      statusQuery: true,
      refunds: false,
      liveMoney: false,
      paymentMethod: "PAYSHAP",
      currency: "ZAR"
    }),

    async createPaymentRequest(input) {
      const request = validatePaymentRequest(input);
      const authentication = credentialsFromEnv(env);
      const transactionId = merchantTransactionId(request.idempotencyKey ?? request.reference);
      const body = {
        authentication,
        merchantTransactionId: transactionId,
        amount: (request.amountMinor / 100).toFixed(2),
        currency: request.currency,
        paymentBrand: "PAYSHAP",
        paymentType: "DB",
        virtualAccount: {
          bank: mapPeachBank(request.payer.bank),
          type: "CELLPHONE",
          accountId: normalizeZaCellphone(request.payer.cellphone)
        },
        shopperResultUrl: request.returnUrl,
        "customParameters[enableTestMode]": "true"
      };

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/payments`, {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json" },
          body: JSON.stringify(body)
        });
      } catch (cause) {
        throw new AnkPayError("PROVIDER_UNREACHABLE", "Could not reach Peach Payments sandbox.", {
          httpStatus: 502,
          provider: this.id,
          cause
        });
      }

      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AnkPayError("PROVIDER_REJECTED", raw?.result?.description ?? "Peach Payments rejected the sandbox request.", {
          httpStatus: 502,
          provider: this.id,
          providerCode: raw?.result?.code ?? String(response.status)
        });
      }
      return normalizePeachResponse(raw, transactionId);
    },

    async getPaymentStatus(input) {
      const authentication = credentialsFromEnv(env);
      const uniqueId = String(input?.providerReference ?? "").trim();
      if (!/^[0-9a-f]{32}$/i.test(uniqueId)) {
        throw new AnkPayError("INVALID_PROVIDER_REFERENCE", "Peach providerReference must be a 32-character transaction id.", {
          httpStatus: 400,
          provider: this.id
        });
      }
      const url = new URL(`${baseUrl}/payments/${uniqueId}`);
      url.searchParams.set("authentication.entityId", authentication.entityId);
      url.searchParams.set("authentication.userId", authentication.userId);
      url.searchParams.set("authentication.password", authentication.password);

      const response = await fetchImpl(url, { headers: { accept: "application/json" } });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AnkPayError("PROVIDER_STATUS_FAILED", raw?.result?.description ?? "Could not query Peach payment status.", {
          httpStatus: 502,
          provider: this.id,
          providerCode: raw?.result?.code ?? String(response.status)
        });
      }
      return normalizePeachResponse(raw, raw?.merchantTransactionId ?? null);
    }
  };
}
