import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../schema/ank-pay-sandbox-v0.2.sql", import.meta.url), "utf8");

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
});
