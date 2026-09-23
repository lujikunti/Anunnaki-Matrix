import { assertProviderAdapter } from "./contract.mjs";
import { createPeachPayShapSandboxAdapter } from "./providers/peach-payshap.mjs";

export function createAnkPay({ provider }) {
  const adapter = assertProviderAdapter(provider);
  return Object.freeze({
    providerId: adapter.id,
    capabilities: adapter.capabilities ?? {},
    createPaymentRequest: (input) => adapter.createPaymentRequest(input),
    getPaymentStatus: (input) => adapter.getPaymentStatus(input)
  });
}

export function createDefaultSandboxAnkPay(options = {}) {
  return createAnkPay({ provider: createPeachPayShapSandboxAdapter(options) });
}

export { AnkPayError, validatePaymentRequest } from "./contract.mjs";
export {
  createPeachPayShapSandboxAdapter,
  PEACH_PAYSHAP_BANKS,
  PEACH_PAYSHAP_TEST_NUMBERS,
  normalizeZaCellphone,
  merchantTransactionId,
  mapPeachResultCode
} from "./providers/peach-payshap.mjs";
