import {
  createAnkPay,
  createMemoryLedger,
  createPeachPayShapSandboxAdapter,
  PEACH_PAYSHAP_TEST_NUMBERS
} from "../packages/ank-pay/src/index.mjs";

// These fallbacks are Peach's publicly documented fake-money example sandbox credentials.
// Merchant/live credentials must always come from server-side secrets instead.
const PUBLIC_DOCS_SANDBOX = Object.freeze({
  PEACH_SANDBOX_ENTITY_ID: "8ac7a4c894809722019482d1df62029d",
  PEACH_SANDBOX_USER_ID: "5fb5e392d6fa11ef9b3002f694e28f55",
  PEACH_SANDBOX_PASSWORD: "OMydSc7ewVmEKPZCAj2WxHoik"
});

const env = {
  PEACH_SANDBOX_ENTITY_ID: process.env.PEACH_SANDBOX_ENTITY_ID || PUBLIC_DOCS_SANDBOX.PEACH_SANDBOX_ENTITY_ID,
  PEACH_SANDBOX_USER_ID: process.env.PEACH_SANDBOX_USER_ID || PUBLIC_DOCS_SANDBOX.PEACH_SANDBOX_USER_ID,
  PEACH_SANDBOX_PASSWORD: process.env.PEACH_SANDBOX_PASSWORD || PUBLIC_DOCS_SANDBOX.PEACH_SANDBOX_PASSWORD
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function actionParams(fields) {
  const params = new URLSearchParams();
  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (field?.name && field.value != null) params.append(field.name, String(field.value));
    }
  } else if (fields && typeof fields === "object") {
    for (const [name, value] of Object.entries(fields)) {
      if (value != null) params.append(name, String(value));
    }
  }
  return params;
}

async function executeRedirectAction(action) {
  if (!action?.url) throw new Error("Peach PayShap create response did not expose the required redirect action.");
  const method = String(action.method ?? "GET").toUpperCase();
  const params = actionParams(action.fields);
  if (method === "GET") {
    const url = new URL(action.url);
    for (const [key, value] of params) url.searchParams.append(key, value);
    return fetch(url, { method: "GET", redirect: "manual" });
  }
  return fetch(action.url, {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    redirect: "manual"
  });
}

const stamp = Date.now();
const pay = createAnkPay({
  provider: createPeachPayShapSandboxAdapter({ env }),
  ledger: createMemoryLedger()
});

const created = await pay.createPayment({
  idempotencyKey: `ank-pay-e2e-${stamp}`,
  productKey: "ank-pay-sandbox-e2e",
  subject: { type: "system", id: "github-actions" },
  amountMinor: 100,
  currency: "ZAR",
  reference: `ANKPAYE2E-${stamp}`,
  returnUrl: "https://example.com/ank-pay-sandbox-return",
  payer: { bank: "FNB", cellphone: PEACH_PAYSHAP_TEST_NUMBERS.success }
});

if (created.status === "succeeded") {
  throw new Error("createPayment must never mark settlement succeeded before status verification.");
}
if (!created.providerReference) throw new Error("Peach sandbox did not return a provider reference.");

const redirectResponse = await executeRedirectAction(created.action);
if (redirectResponse.status >= 500) {
  throw new Error(`Peach PayShap redirect action failed with HTTP ${redirectResponse.status}.`);
}

await sleep(5000);
let verified = await pay.verifyPayment({ paymentId: created.id });
if (verified.status !== "succeeded") {
  // Peach documents two status queries per minute per transaction. This is the only retry.
  await sleep(30000);
  verified = await pay.verifyPayment({ paymentId: created.id });
}

if (verified.status !== "succeeded") {
  throw new Error(`Peach sandbox did not reach verified success; final status=${verified.status}`);
}
if (!verified.settlementVerifiedAt) throw new Error("Verified settlement timestamp is missing.");
if (verified.entitlement?.state !== "sandbox_active") {
  throw new Error("Sandbox entitlement was not granted after verified settlement.");
}

console.log(JSON.stringify({
  ok: true,
  provider: verified.provider,
  status: verified.status,
  paymentId: verified.id,
  providerReference: verified.providerReference,
  settlementVerified: Boolean(verified.settlementVerifiedAt),
  entitlementState: verified.entitlement.state,
  redirectStatus: redirectResponse.status
}, null, 2));
