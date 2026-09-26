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
    providerAction: row.provider_action ?? null,
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

    async findPaymentByProviderIdentity({ provider, providerReference, merchantTransactionId }) {
      const rows = await run(
        `select * from ank_pay_sandbox.payments
         where provider=$1
           and (($2::text is not null and provider_reference=$2) or ($3::text is not null and merchant_transaction_id=$3))
         order by created_at desc
         limit 2`,
        [provider, providerReference ?? null, merchantTransactionId ?? null]
      );
      if (rows.length !== 1) {
        throw new AnkPayError(rows.length ? "AMBIGUOUS_PAYMENT" : "PAYMENT_NOT_FOUND", rows.length ? "Webhook matched more than one payment." : "Webhook payment not found.", { httpStatus: rows.length ? 409 : 404 });
      }
      return camelPayment(rows[0]);
    },

    async recordProviderResult(paymentId, { phase, result }) {
      const eventKey = `${phase}:${result.providerCode ?? "none"}:${result.providerReference ?? "none"}:${result.providerTimestamp ?? randomUUID()}`;
      const rows = await run(
        `select (ank_pay_sandbox.record_provider_result($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::jsonb)).*`,
        [paymentId, eventKey, `provider.${phase}`, result.status, result.providerCode ?? null,
         result.providerReference ?? null, result.merchantTransactionId ?? null, result.providerTimestamp ?? null,
         JSON.stringify(result.action ?? null)]
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

    async createProofReceipt(receipt) {
      const rows = await run(
        `insert into ank_pay_sandbox.proof_receipts(id,payment_id,receipt_type,content_hash,content)
         values($1,$2::uuid,'payment_settlement',$3,$4::jsonb)
         on conflict(payment_id,receipt_type) do update
           set content=ank_pay_sandbox.proof_receipts.content
         returning *`,
        [receipt.id, receipt.content.paymentId, receipt.contentHash, JSON.stringify(receipt.content)]
      );
      const row = rows[0];
      return {
        id: row.id,
        paymentId: row.payment_id,
        contentHash: row.content_hash,
        content: row.content,
        createdAt: row.created_at
      };
    },

    async recordWebhookInbox({ paymentId, provider, webhookId, rawHash, providerReference, merchantTransactionId, providerCode, providerTimestamp, status, details = {} }) {
      const rows = await run(
        `insert into ank_pay_sandbox.webhook_inbox(
           payment_id,provider,webhook_id,raw_hash,provider_reference,merchant_transaction_id,provider_code,provider_timestamp,status,details
         ) values($1::uuid,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10::jsonb)
         on conflict(provider,webhook_id) do update set webhook_id=excluded.webhook_id
         returning *`,
        [paymentId,provider,webhookId,rawHash,providerReference ?? null,merchantTransactionId ?? null,providerCode ?? null,providerTimestamp ?? null,status ?? null,JSON.stringify(details)]
      );
      return rows[0];
    },

    async listEvents(paymentId) {
      return run("select * from ank_pay_sandbox.payment_events where payment_id=$1::uuid order by occurred_at,id", [paymentId]);
    },

    async listEntitlements(paymentId) {
      const rows = await run("select * from ank_pay_sandbox.entitlements where payment_id=$1::uuid order by granted_at,id", [paymentId]);
      return rows.map(camelEntitlement);
    },

    async listReceipts(paymentId) {
      const rows = await run("select * from ank_pay_sandbox.proof_receipts where payment_id=$1::uuid order by created_at,id", [paymentId]);
      return rows.map((row) => ({
        id: row.id,
        paymentId: row.payment_id,
        contentHash: row.content_hash,
        content: row.content,
        createdAt: row.created_at
      }));
    },

    async reconciliationSnapshot() {
      const rows = await run("select ank_pay_sandbox.reconciliation_snapshot() as snapshot");
      return rows[0]?.snapshot ?? { generatedAt: new Date().toISOString(), totals: {}, rows: [] };
    }
  };
}
