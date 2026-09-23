import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "packages/ank-pay/src/contract.mjs",
  "packages/ank-pay/src/index.mjs",
  "packages/ank-pay/src/providers/peach-payshap.mjs",
  "packages/ank-pay/tests/peach-payshap.test.mjs",
  "api/ank-pay/health.mjs",
  "api/ank-pay/payshap.mjs"
];

for (const file of requiredFiles) await readFile(file, "utf8");

const adapter = await readFile("packages/ank-pay/src/providers/peach-payshap.mjs", "utf8");
const endpoint = await readFile("api/ank-pay/payshap.mjs", "utf8");
const readme = await readFile("packages/ank-pay/README.md", "utf8");

const assertions = [
  [adapter.includes("https://testapi-v2.peachpayments.com"), "official Peach sandbox endpoint"],
  [!adapter.includes("https://api-v2.peachpayments.com"), "no Peach live endpoint in v0.1 adapter"],
  [adapter.includes('paymentBrand: "PAYSHAP"'), "PayShap payment brand"],
  [adapter.includes('"customParameters[enableTestMode]": "true"'), "Peach sandbox simulator flag"],
  [adapter.includes("createPaymentRequest") && adapter.includes("getPaymentStatus"), "provider interface"],
  [endpoint.includes("ANK_PAY_SANDBOX_API_ENABLED"), "explicit sandbox API kill switch"],
  [endpoint.includes("ANK_PAY_SANDBOX_ACCESS_TOKEN"), "sandbox API bearer protection"],
  [readme.includes("do **not** import Peach-"), "product/provider isolation documented"],
  [readme.includes("no entitlement mutation yet"), "no false production-completeness claim"]
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`ANK Pay validation failed: ${label}`);
}

const test = spawnSync(process.execPath, ["--test", "packages/ank-pay/tests/*.test.mjs"], {
  shell: true,
  stdio: "inherit"
});
if (test.status !== 0) process.exit(test.status ?? 1);
console.log("ANK Pay validation passed.");
