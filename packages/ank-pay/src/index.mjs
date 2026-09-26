import { createAnkPay } from "./engine.mjs";
import { createMemoryLedger } from "./ledger-memory.mjs";
import { createPeachPayShapSandboxAdapter } from "./providers/peach-payshap.mjs";

export { createAnkPay } from "./engine.mjs";
export { createMemoryLedger } from "./ledger-memory.mjs";
export { createPostgresLedger } from "./ledger-postgres.mjs";
export { createPaymentProofReceipt, verifyPaymentProofReceipt } from "./receipt.mjs";
export { decryptPeachPaymentsWebhook, verifyPeachCheckoutHmac, normalizePeachWebhook } from "./peach-webhook.mjs";

export function createDefaultSandboxAnkPay(options = {}) {
  return createAnkPay({
    provider: createPeachPayShapSandboxAdapter(options),
    ledger: options.ledger ?? createMemoryLedger()
  });
}

export {
  AnkPayError,
  ANK_PAY_STATUSES,
  validatePaymentRequest,
  validatePaymentIntent,
  paymentIntentFingerprint
} from "./contract.mjs";
export {
  createPeachPayShapSandboxAdapter,
  PEACH_PAYSHAP_BANKS,
  PEACH_PAYSHAP_TEST_NUMBERS,
  normalizeZaCellphone,
  merchantTransactionId,
  mapPeachResultCode
} from "./providers/peach-payshap.mjs";
