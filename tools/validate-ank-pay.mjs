import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "packages/ank-pay/src/contract.mjs",
  "packages/ank-pay/src/engine.mjs",
  "packages/ank-pay/src/index.mjs",
  "packages/ank-pay/src/ledger-memory.mjs",
  "packages/ank-pay/src/ledger-postgres.mjs",
  "packages/ank-pay/src/providers/peach-payshap.mjs",
  "packages/ank-pay/src/peach-webhook.mjs",
  "packages/ank-pay/src/receipt.mjs",
  "packages/ank-pay/schema/ank-pay-sandbox-v0.2.sql",
  "packages/ank-pay/schema/ank-pay-sandbox-v0.3.sql",
  "packages/ank-pay/tests/engine.test.mjs",
  "packages/ank-pay/tests/peach-payshap.test.mjs",
  "packages/ank-pay/tests/peach-webhook.test.mjs",
  "packages/ank-pay/tests/receipt.test.mjs",
  "packages/ank-pay/tests/postgres-ledger.test.mjs",
  "packages/ank-pay/tests/schema-contract.test.mjs",
  "api/ank-pay/health.mjs",
  "api/ank-pay/payshap.mjs",
  "tools/e2e-ank-pay-peach.mjs"
];

for (const file of requiredFiles) await readFile(file, "utf8");

const adapter = await readFile("packages/ank-pay/src/providers/peach-payshap.mjs", "utf8");
const engine = await readFile("packages/ank-pay/src/engine.mjs", "utf8");
const schema = await readFile("packages/ank-pay/schema/ank-pay-sandbox-v0.2.sql", "utf8");
const schema03 = await readFile("packages/ank-pay/schema/ank-pay-sandbox-v0.3.sql", "utf8");
const webhook = await readFile("packages/ank-pay/src/peach-webhook.mjs", "utf8");
const receipt = await readFile("packages/ank-pay/src/receipt.mjs", "utf8");
const endpoint = await readFile("api/ank-pay/payshap.mjs", "utf8");
const readme = await readFile("packages/ank-pay/README.md", "utf8");

const assertions = [
  [adapter.includes("https://testapi-v2.peachpayments.com"), "official Peach sandbox endpoint"],
  [!adapter.includes('baseUrl: "https://api-v2.peachpayments.com"'), "no configured Peach live endpoint"],
  [adapter.includes('paymentBrand: "PAYSHAP"'), "PayShap payment brand"],
  [adapter.includes('"customParameters[enableTestMode]": "true"'), "Peach simulator flag"],
  [engine.includes("verifyPayment") && engine.includes("verifyProviderIdentity"), "independent settlement verification"],
  [engine.includes("A webhook never grants access"), "webhook cannot grant entitlement"],
  [schema.includes("idempotency_key text not null unique"), "durable idempotency"],
  [schema.includes("ANK_PAY_UNVERIFIED_SETTLEMENT"), "verified entitlement database gate"],
  [schema.includes("revoke all on schema ank_pay_sandbox from public, anon, authenticated"), "private database boundary"],
  [endpoint.includes("ANK_PAY_SANDBOX_API_ENABLED"), "explicit sandbox API kill switch"],
  [endpoint.includes("ANK_PAY_SANDBOX_ACCESS_TOKEN"), "sandbox API bearer protection"],
  [webhook.includes("aes-256-gcm") && webhook.includes("setAuthTag"), "authenticated Payments API webhook decryption"],
  [receipt.includes("ANK.PAY.PROOF.RECEIPT.V1") && receipt.includes("webhookIsSettlementProof: false"), "tamper-evident settlement Proof receipt"],
  [schema03.includes("ANK_PAY_UNVERIFIED_SETTLEMENT_RECEIPT"), "database receipt settlement gate"],
  [schema03.includes("reconciliation_snapshot"), "reconciliation snapshot"],
  [schema03.includes("Raw encrypted/decrypted webhook bodies are not retained"), "webhook plaintext retention prohibited"],
  [!schema03.toLowerCase().includes("security definer"), "no privileged v0.3 database function"],
  [readme.includes("v0.3 rule: webhook is a signal, not settlement"), "v0.3 lifecycle documented"],
  [readme.includes("no live-money endpoint"), "no false production-completeness claim"]
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`ANK Pay validation failed: ${label}`);
}

const test = spawnSync(process.execPath, ["--test", "packages/ank-pay/tests/*.test.mjs"], {
  shell: true,
  stdio: "inherit"
});
if (test.status !== 0) process.exit(test.status ?? 1);
console.log("ANK Pay v0.3 validation passed.");
