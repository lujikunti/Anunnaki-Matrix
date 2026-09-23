export default function handler(_request, response) {
  const configured = Boolean(
    process.env.PEACH_SANDBOX_ENTITY_ID &&
    process.env.PEACH_SANDBOX_USER_ID &&
    process.env.PEACH_SANDBOX_PASSWORD
  );
  response.status(200).json({
    service: "ank-pay",
    version: "0.2.0",
    mode: "sandbox",
    provider: "peach-payshap-sandbox",
    ledgerContract: "postgres-private-schema",
    settlementRule: "provider-status-query",
    entitlementMode: "sandbox-only",
    liveMoney: false,
    apiEnabled: process.env.ANK_PAY_SANDBOX_API_ENABLED === "true",
    providerConfigured: configured
  });
}
