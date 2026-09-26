import { AnkPayError, assertProviderAdapter, paymentIntentFingerprint, validatePaymentIntent } from "./contract.mjs";
import { createMemoryLedger } from "./ledger-memory.mjs";
import { createPaymentProofReceipt } from "./receipt.mjs";

function publicPayment(payment, { replayed = false, entitlement = null } = {}) {
  return {
    id: payment.id,
    status: payment.status,
    provider: payment.provider,
    providerReference: payment.providerReference,
    merchantTransactionId: payment.merchantTransactionId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    reference: payment.reference,
    productKey: payment.productKey,
    subject: payment.subject,
    settlementVerifiedAt: payment.settlementVerifiedAt,
    action: payment.providerAction ?? null,
    replayed,
    entitlement
  };
}

function verifyProviderIdentity(payment, result) {
  const failures = [];
  if (result.provider && result.provider !== payment.provider) failures.push("provider_mismatch");
  if (payment.providerReference && result.providerReference && result.providerReference !== payment.providerReference) failures.push("provider_reference_mismatch");
  if (payment.merchantTransactionId && result.merchantTransactionId && result.merchantTransactionId !== payment.merchantTransactionId) failures.push("merchant_transaction_id_mismatch");
  if (Number.isInteger(result.amountMinor) && result.amountMinor !== payment.amountMinor) failures.push("amount_mismatch");
  if (result.currency && result.currency !== payment.currency) failures.push("currency_mismatch");
  if (result.paymentBrand && result.paymentBrand !== "PAYSHAP") failures.push("payment_brand_mismatch");
  return failures;
}

export function createAnkPay({ provider, ledger = createMemoryLedger() }) {
  const adapter = assertProviderAdapter(provider);
  if (!ledger || typeof ledger.claimPaymentIntent !== "function") {
    throw new AnkPayError("INVALID_LEDGER", "ANK Pay requires a ledger adapter.", { httpStatus: 500 });
  }

  return Object.freeze({
    providerId: adapter.id,
    capabilities: adapter.capabilities ?? {},
    ledgerKind: ledger.kind ?? "custom",

    // v0.1 low-level compatibility. Product code should use createPayment().
    createPaymentRequest: (input) => adapter.createPaymentRequest(input),
    getPaymentStatus: (input) => adapter.getPaymentStatus(input),

    async createPayment(input) {
      const intent = validatePaymentIntent(input);
      const requestFingerprint = paymentIntentFingerprint(intent, adapter.id);
      const { payment, replayed } = await ledger.claimPaymentIntent({
        ...intent,
        provider: adapter.id,
        requestFingerprint
      });
      if (replayed) return publicPayment(payment, { replayed: true });

      const result = await adapter.createPaymentRequest(intent);
      const updated = await ledger.recordProviderResult(payment.id, { phase: "create", result });
      return publicPayment(updated);
    },

    async verifyPayment({ paymentId }) {
      const payment = await ledger.getPayment(paymentId);
      if (!payment.providerReference) {
        throw new AnkPayError("PROVIDER_REFERENCE_MISSING", "Payment cannot be verified before a provider reference exists.", { httpStatus: 409 });
      }
      const result = await adapter.getPaymentStatus({ providerReference: payment.providerReference });
      await ledger.recordProviderResult(payment.id, { phase: "status", result });
      const failures = verifyProviderIdentity(payment, result);
      if (failures.length) {
        const failed = await ledger.recordVerificationFailure(payment.id, failures.join(","));
        return publicPayment(failed);
      }

      const verified = await ledger.markVerification(payment.id, result);
      let entitlement = null;
      let receipt = null;
      if (verified.status === "succeeded") {
        entitlement = await ledger.grantSandboxEntitlement(payment.id);
        if (typeof ledger.createProofReceipt === "function") {
          const events = typeof ledger.listEvents === "function" ? await ledger.listEvents(payment.id) : [];
          receipt = await ledger.createProofReceipt(
            createPaymentProofReceipt({ payment: verified, events, entitlement, verification: result })
          );
        }
      }
      return { ...publicPayment(verified, { entitlement }), receipt };
    },

    async recordWebhookHint({ paymentId, providerStatus, providerCode = null, providerTimestamp = null }) {
      const payment = await ledger.getPayment(paymentId);
      await ledger.recordProviderResult(payment.id, {
        phase: "webhook_hint",
        result: {
          provider: adapter.id,
          providerReference: payment.providerReference,
          merchantTransactionId: payment.merchantTransactionId,
          status: providerStatus ?? "unknown",
          providerCode,
          providerTimestamp
        }
      });
      // A webhook never grants access. Caller must run verifyPayment().
      return publicPayment(await ledger.getPayment(payment.id));
    },

    async processWebhookHint({ webhookId, rawHash, normalized }) {
      if (!normalized || typeof normalized !== "object") {
        throw new AnkPayError("INVALID_WEBHOOK", "Normalized webhook data is required.", { httpStatus: 400 });
      }
      if (typeof ledger.findPaymentByProviderIdentity !== "function" || typeof ledger.recordWebhookInbox !== "function") {
        throw new AnkPayError("WEBHOOK_LEDGER_UNAVAILABLE", "Ledger does not support durable webhook reconciliation.", { httpStatus: 501 });
      }
      const payment = await ledger.findPaymentByProviderIdentity({
        provider: adapter.id,
        providerReference: normalized.providerReference,
        merchantTransactionId: normalized.merchantTransactionId
      });
      await ledger.recordWebhookInbox({
        paymentId: payment.id,
        provider: adapter.id,
        webhookId,
        rawHash,
        providerReference: normalized.providerReference,
        merchantTransactionId: normalized.merchantTransactionId,
        providerCode: normalized.providerCode,
        providerTimestamp: normalized.providerTimestamp,
        status: normalized.status,
        details: {
          notificationType: normalized.notificationType ?? null,
          paymentBrand: normalized.paymentBrand ?? null,
          paymentType: normalized.paymentType ?? null,
          amount: normalized.amount ?? null,
          currency: normalized.currency ?? null
        }
      });
      await this.recordWebhookHint({
        paymentId: payment.id,
        providerStatus: normalized.status,
        providerCode: normalized.providerCode,
        providerTimestamp: normalized.providerTimestamp
      });
      // Webhook is a hint only. Access can be granted only after this independent provider status query.
      return this.verifyPayment({ paymentId: payment.id });
    },

    getPayment: (paymentId) => ledger.getPayment(paymentId),
    listEvents: (paymentId) => ledger.listEvents(paymentId),
    listEntitlements: (paymentId) => ledger.listEntitlements(paymentId),
    listReceipts: (paymentId) => typeof ledger.listReceipts === "function" ? ledger.listReceipts(paymentId) : [],
    reconciliationSnapshot: () => {
      if (typeof ledger.reconciliationSnapshot !== "function") {
        throw new AnkPayError("RECONCILIATION_UNAVAILABLE", "Ledger does not support reconciliation snapshots.", { httpStatus: 501 });
      }
      return ledger.reconciliationSnapshot();
    }
  });
}
