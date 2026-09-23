import { randomUUID } from "node:crypto";
import { AnkPayError } from "./contract.mjs";

function camelPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    provider: row.provider,
    providerReference: row.provider_reference,
    merchantTransactionId: row.merchant_transaction_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    reference: row.reference,
    productKey: row.product_key,
    subject: { type: row.subject_type, id: row.subject_id },
    status: row.status,
    providerCode: row.provider_code,
    metadata: row.metadata ?? {},
    statusVerifiedAt: row.status_verified_at,
    settlementVerifiedAt: row.settlement_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function camelEntitlement(row) {
  return row ? {
    id: row.id,
    paymentId: row.payment_id,
    productKey: row.product_key,
    subject: { type: row.subject_type, id: row.subject_id },
    state: row.state,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at
  } : null;
}

function createQueryRunner(query) {
  if (typeof query !== "function") throw new AnkPayError("INVALID_LEDGER", "Postgres ledger requires query(text, params).", { httpStatus: 500 });
  return async (text, params = []) => {
    const result = await query(text, params);
    if (Array.isArray(result)) return result;
    return result?.rows ?? [];
  };
}

export function createPostgresLedger({ query }) {
  const run = createQueryRunner(query);
  const paymentById = async (paymentId) => {
    const rows = await run("select * from ank_pay_sandbox.payments where id = $1::uuid", [paymentId]);
    if (!rows[0]) throw new AnkPayError("PAYMENT_NOT_FOUND", "Payment not found.", { httpStatus: 404 });
    return camelPayment(rows[0]);
  };

  return {
    kind: "postgres",

    async claimPaymentIntent(intent) {
      let claim;
      try {
        const rows = await run(
          `select * from ank_pay_sandbox.claim_payment_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [intent.idempotencyKey, intent.requestFingerprint, intent.provider, intent.amountMinor, intent.currency,
           intent.reference, intent.productKey, intent.subject.type, intent.subject.id, JSON.stringify(intent.metadata ?? {})]
        );
        claim = rows[0];
      } catch (error) {
        if (String(error?.message ?? "").includes("ANK_PAY_IDEMPOTENCY_CONFLICT")) {
          throw new AnkPayError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for a different payment intent.", { httpStatus: 409, cause: error });
        }
        throw error;
      }
      return { payment: await paymentById(claim.payment_id), replayed: Boolean(claim.replayed) };
    },

    getPayment: paymentById,

    async recordProviderResult(paymentId, { phase, result }) {
      const eventKey = `${phase}:${result.providerCode ?? "none"}:${result.providerReference ?? "none"}:${result.providerTimestamp ?? randomUUID()}`;
      const rows = await run(
        `select (ank_pay_sandbox.record_provider_result($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)).*`,
        [paymentId, eventKey, `provider.${phase}`, result.status, result.providerCode ?? null,
         result.providerReference ?? null, result.merchantTransactionId ?? null, result.providerTimestamp ?? null]
      );
      return camelPayment(rows[0]);
    },

    async markVerification(paymentId, verification) {
      const rows = await run(
        `select (ank_pay_sandbox.mark_verification($1,$2,$3,$4)).*`,
        [paymentId, verification.status, verification.providerCode ?? null, `verified:${verification.providerCode ?? "none"}:${randomUUID()}`]
      );
      return camelPayment(rows[0]);
    },

    async recordVerificationFailure(paymentId, reason) {
      const rows = await run(
        `select (ank_pay_sandbox.record_verification_failure($1,$2,$3)).*`,
        [paymentId, reason, `verification-failed:${randomUUID()}`]
      );
      return camelPayment(rows[0]);
    },

    async grantSandboxEntitlement(paymentId) {
      const grant = await run("select ank_pay_sandbox.grant_verified_sandbox_entitlement($1::uuid) as id", [paymentId]);
      const rows = await run("select * from ank_pay_sandbox.entitlements where id = $1::uuid", [grant[0].id]);
      return camelEntitlement(rows[0]);
    },

    async listEvents(paymentId) {
      return run("select * from ank_pay_sandbox.payment_events where payment_id=$1::uuid order by occurred_at,id", [paymentId]);
    },

    async listEntitlements(paymentId) {
      const rows = await run("select * from ank_pay_sandbox.entitlements where payment_id=$1::uuid order by granted_at,id", [paymentId]);
      return rows.map(camelEntitlement);
    }
  };
}
