export default function handler(_request, response) {
  const configured = Boolean(
    process.env.PEACH_SANDBOX_ENTITY_ID &&
    process.env.PEACH_SANDBOX_USER_ID &&
    process.env.PEACH_SANDBOX_PASSWORD
  );
  response.status(200).json({
    service: "ank-pay",
    version: "0.3.0",
    mode: "sandbox",
    provider: "peach-payshap-sandbox",
    ledgerContract: "postgres-private-schema",
    settlementRule: "authenticated-webhook-hint-plus-provider-status-query",
    proofReceipt: "ANK.PAY.PROOF.RECEIPT.V1",
    reconciliation: "private-ledger-snapshot",
    webhookCrypto: "peach-payments-api-aes-256-gcm",
    entitlementMode: "sandbox-only",
    liveMoney: false,
    apiEnabled: process.env.ANK_PAY_SANDBOX_API_ENABLED === "true",
    providerConfigured: configured,
    webhookConfigured: Boolean(process.env.PEACH_SANDBOX_WEBHOOK_SECRET),
    durableRuntimeConfigured: false
  });
}
