import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const v02 = await readFile(new URL("../schema/ank-pay-sandbox-v0.2.sql", import.meta.url), "utf8");
const v03 = await readFile(new URL("../schema/ank-pay-sandbox-v0.3.sql", import.meta.url), "utf8");
const sql = v02 + "\n" + v03;

test("sandbox schema is private and durable settlement is gated", () => {
  assert.match(sql, /create schema if not exists ank_pay_sandbox/i);
  assert.match(sql, /revoke all on schema ank_pay_sandbox from public, anon, authenticated/i);
  assert.match(sql, /idempotency_key text not null unique/i);
  assert.match(sql, /ANK_PAY_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /record_provider_result/);
  assert.match(sql, /mark_verification/);
  assert.match(sql, /record_verification_failure/);
  assert.match(sql, /settlement_verified_at is null/);
  assert.match(sql, /ANK_PAY_UNVERIFIED_SETTLEMENT/);
  assert.match(sql, /unique \(payment_id, product_key, subject_type, subject_id\)/i);
  assert.match(v03, /create table if not exists ank_pay_sandbox\.webhook_inbox/i);
  assert.match(v03, /create table if not exists ank_pay_sandbox\.proof_receipts/i);
  assert.match(v03, /ANK_PAY_UNVERIFIED_SETTLEMENT_RECEIPT/);
  assert.match(v03, /reconciliation_snapshot/);
  assert.match(v03, /Raw encrypted\/decrypted webhook bodies are not retained/i);
  assert.doesNotMatch(v03, /security definer/i);
});
