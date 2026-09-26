import { AnkPayError, newPaymentId } from "./contract.mjs";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createMemoryLedger({ clock = () => new Date() } = {}) {
  const payments = new Map();
  const byIdempotency = new Map();
  const events = [];
  const entitlements = new Map();
  const receipts = new Map();
  const webhookInbox = new Map();
  const reconciliationIssues = [];

  function now() { return clock().toISOString(); }
  function issue(paymentId, issueCode, details = {}) {
    reconciliationIssues.push({ id: newPaymentId(), paymentId, issueCode, details: clone(details), createdAt: now(), resolvedAt: null });
  }

  return {
    kind: "memory",

    async claimPaymentIntent(intent) {
      const existingId = byIdempotency.get(intent.idempotencyKey);
      if (existingId) {
        const existing = payments.get(existingId);
        if (existing.requestFingerprint !== intent.requestFingerprint) {
          throw new AnkPayError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for a different payment intent.", { httpStatus: 409 });
        }
        return { payment: clone(existing), replayed: true };
      }

      const timestamp = now();
      const payment = {
        id: newPaymentId(),
        idempotencyKey: intent.idempotencyKey,
        requestFingerprint: intent.requestFingerprint,
        provider: intent.provider,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        reference: intent.reference,
        productKey: intent.productKey,
        subject: clone(intent.subject),
        metadata: clone(intent.metadata ?? {}),
        providerReference: null,
        merchantTransactionId: null,
        providerCode: null,
        providerAction: null,
        status: "created",
        statusVerifiedAt: null,
        settlementVerifiedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      payments.set(payment.id, payment);
      byIdempotency.set(payment.idempotencyKey, payment.id);
      events.push({ id: newPaymentId(), paymentId: payment.id, type: "intent.claimed", status: "created", occurredAt: timestamp });
      return { payment: clone(payment), replayed: false };
    },

    async getPayment(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
      return clone(payment);
    },

    async findPaymentByProviderIdentity({ provider, providerReference, merchantTransactionId }) {
      const candidates = [...payments.values()].filter((payment) =>
        payment.provider === provider &&
        (
          (providerReference && payment.providerReference === providerReference) ||
          (merchantTransactionId && payment.merchantTransactionId === merchantTransactionId)
        )
      );
      if (candidates.length !== 1) {
        throw new AnkPayError(candidates.length ? "AMBIGUOUS_PAYMENT" : "PAYMENT_NOT_FOUND", candidates.length ? "Webhook matched more than one payment." : "Webhook payment not found.", { httpStatus: candidates.length ? 409 : 404 });
      }
      return clone(candidates[0]);
    },

    async recordProviderResult(paymentId, { phase, result }) {
      const payment = payments.get(paymentId);
      if (!payment) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
      const timestamp = now();
      if (payment.providerReference && result.providerReference && payment.providerReference !== result.providerReference) {
        issue(paymentId, "provider_reference_mismatch", { incoming: result.providerReference });
      }
      if (payment.merchantTransactionId && result.merchantTransactionId && payment.merchantTransactionId !== result.merchantTransactionId) {
        issue(paymentId, "merchant_transaction_id_mismatch", { incoming: result.merchantTransactionId });
      }
      payment.providerReference = result.providerReference ?? payment.providerReference;
      payment.merchantTransactionId = result.merchantTransactionId ?? payment.merchantTransactionId;
      payment.providerCode = result.providerCode ?? payment.providerCode;
      payment.providerAction = result.action ?? payment.providerAction;
      if (payment.status !== "succeeded") {
        payment.status = result.status === "succeeded" ? "awaiting_verification" : result.status;
      }
      payment.updatedAt = timestamp;
      events.push({
        id: newPaymentId(), paymentId, type: `provider.${phase}`, status: result.status,
        providerCode: result.providerCode ?? null, providerReference: result.providerReference ?? null,
        merchantTransactionId: result.merchantTransactionId ?? null, providerTimestamp: result.providerTimestamp ?? null,
        occurredAt: timestamp
      });
      return clone(payment);
    },

    async markVerification(paymentId, verification) {
      const payment = payments.get(paymentId);
      if (!payment) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
      const timestamp = now();
      if (payment.status === "succeeded" && verification.status !== "succeeded") {
        issue(paymentId, "verified_success_regression", { incomingStatus: verification.status, providerCode: verification.providerCode ?? null });
        events.push({ id: newPaymentId(), paymentId, type: "verification.reconciliation_required", status: verification.status, occurredAt: timestamp });
        return clone(payment);
      }
      payment.status = verification.status;
      payment.providerCode = verification.providerCode ?? payment.providerCode;
      payment.statusVerifiedAt = timestamp;
      payment.settlementVerifiedAt = verification.status === "succeeded" ? (payment.settlementVerifiedAt ?? timestamp) : payment.settlementVerifiedAt;
      payment.updatedAt = timestamp;
      events.push({ id: newPaymentId(), paymentId, type: "provider.verified", status: verification.status, providerCode: verification.providerCode ?? null, occurredAt: timestamp });
      return clone(payment);
    },

    async recordVerificationFailure(paymentId, reason) {
      const payment = payments.get(paymentId);
      if (!payment) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
      const timestamp = now();
      if (payment.status !== "succeeded") payment.status = "verification_failed";
      payment.updatedAt = timestamp;
      issue(paymentId, "verification_failed", { reason });
      events.push({ id: newPaymentId(), paymentId, type: "verification.failed", status: "verification_failed", reason, occurredAt: timestamp });
      return clone(payment);
    },

    async grantSandboxEntitlement(paymentId) {
      const payment = payments.get(paymentId);
      if (!payment) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
      if (payment.status !== "succeeded" || !payment.settlementVerifiedAt) {
        throw new AnkPayError("UNVERIFIED_SETTLEMENT", "Sandbox entitlement cannot be granted before verified settlement.", { httpStatus: 409 });
      }
      const key = `${payment.id}:${payment.productKey}:${payment.subject.type}:${payment.subject.id}`;
      const existing = entitlements.get(key);
      if (existing) return clone(existing);
      const entitlement = {
        id: newPaymentId(), paymentId: payment.id, productKey: payment.productKey,
        subject: clone(payment.subject), state: "sandbox_active", grantedAt: now()
      };
      entitlements.set(key, entitlement);
      events.push({ id: newPaymentId(), paymentId, type: "entitlement.sandbox_granted", status: "succeeded", occurredAt: entitlement.grantedAt });
      return clone(entitlement);
    },

    async createProofReceipt(receipt) {
      const paymentId = receipt?.content?.paymentId;
      if (!paymentId || !payments.has(paymentId)) throw new AnkPayError("PAYMENT_NOT_FOUND", "Receipt payment not found.", { httpStatus: 404 });
      const key = `${paymentId}:payment_settlement`;
      const existing = receipts.get(key);
      if (existing) return clone(existing);
      const row = { ...clone(receipt), paymentId, createdAt: now() };
      receipts.set(key, row);
      events.push({ id: newPaymentId(), paymentId, type: "proof.receipt_issued", status: "succeeded", occurredAt: row.createdAt, contentHash: row.contentHash });
      return clone(row);
    },

    async recordWebhookInbox({ paymentId, provider, webhookId, rawHash, providerReference, merchantTransactionId, providerCode, providerTimestamp, status, details = {} }) {
      const key = `${provider}:${webhookId}`;
      const existing = webhookInbox.get(key);
      if (existing) return clone(existing);
      if (!payments.has(paymentId)) throw new AnkPayError("PAYMENT_NOT_FOUND", "Webhook payment not found.", { httpStatus: 404 });
      const row = {
        id: newPaymentId(), paymentId, provider, webhookId, rawHash, providerReference, merchantTransactionId,
        providerCode, providerTimestamp, status, details: clone(details), receivedAt: now()
      };
      webhookInbox.set(key, row);
      events.push({ id: newPaymentId(), paymentId, type: "webhook.authenticated", status, providerCode, occurredAt: row.receivedAt });
      return clone(row);
    },

    async listEvents(paymentId) {
      return clone(events.filter((event) => event.paymentId === paymentId));
    },

    async listEntitlements(paymentId) {
      return clone([...entitlements.values()].filter((entitlement) => entitlement.paymentId === paymentId));
    },

    async listReceipts(paymentId) {
      return clone([...receipts.values()].filter((receipt) => receipt.paymentId === paymentId));
    },

    async reconciliationSnapshot() {
      const rows = [...payments.values()].map((payment) => ({
        payment: clone(payment),
        entitlements: [...entitlements.values()].filter((x) => x.paymentId === payment.id).map(clone),
        receipts: [...receipts.values()].filter((x) => x.paymentId === payment.id).map(clone),
        issues: reconciliationIssues.filter((x) => x.paymentId === payment.id && !x.resolvedAt).map(clone)
      }));
      return {
        generatedAt: now(),
        totals: {
          payments: rows.length,
          succeeded: rows.filter((x) => x.payment.status === "succeeded").length,
          pending: rows.filter((x) => ["created","pending","awaiting_verification","unknown"].includes(x.payment.status)).length,
          openIssues: reconciliationIssues.filter((x) => !x.resolvedAt).length,
          receipts: receipts.size
        },
        rows
      };
    }
  };
}
