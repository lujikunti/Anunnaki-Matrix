import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function safeEvents(events = []) {
  return events.map((event) => ({
    type: event.type ?? event.event_type ?? null,
    status: event.status ?? null,
    providerCode: event.providerCode ?? event.provider_code ?? null,
    providerTimestamp: event.providerTimestamp ?? event.provider_timestamp ?? null,
    occurredAt: event.occurredAt ?? event.occurred_at ?? null
  }));
}
export function createPaymentProofReceipt({ payment, events = [], entitlement = null, verification = null, clock = () => new Date() }) {
  if (!payment?.id) throw new TypeError("payment with id is required");
  const eventSummary = safeEvents(events);
  const content = {
    schema: "ANK.PAY.PROOF.RECEIPT.V1",
    receiptType: "payment_settlement",
    paymentId: payment.id,
    provider: payment.provider ?? null,
    providerReference: payment.providerReference ?? null,
    merchantTransactionId: payment.merchantTransactionId ?? null,
    reference: payment.reference ?? null,
    amountMinor: payment.amountMinor ?? null,
    currency: payment.currency ?? null,
    productKey: payment.productKey ?? null,
    subject: payment.subject ?? null,
    paymentStatus: payment.status ?? null,
    statusVerifiedAt: payment.statusVerifiedAt ?? null,
    settlementVerifiedAt: payment.settlementVerifiedAt ?? null,
    entitlement: entitlement ? {
      id: entitlement.id ?? null,
      state: entitlement.state ?? null,
      productKey: entitlement.productKey ?? payment.productKey ?? null,
      subject: entitlement.subject ?? payment.subject ?? null,
      grantedAt: entitlement.grantedAt ?? null
    } : null,
    verification: verification ? {
      providerCode: verification.providerCode ?? null,
      providerDescription: verification.providerDescription ?? null,
      providerTimestamp: verification.providerTimestamp ?? null,
      paymentBrand: verification.paymentBrand ?? null
    } : null,
    eventCount: eventSummary.length,
    eventDigest: digest(eventSummary),
    issuedAt: clock().toISOString(),
    rules: {
      providerCreateResponseIsSettlementProof: false,
      webhookIsSettlementProof: false,
      independentStatusVerificationRequired: true
    }
  };
  const contentHash = digest(content);
  return {
    id: `payr_${contentHash.slice(0, 24)}`,
    contentHash,
    content
  };
}
export function verifyPaymentProofReceipt(receipt) {
  if (!receipt?.content || !receipt?.contentHash) return false;
  return digest(receipt.content) === receipt.contentHash;
}
