import { createDefaultSandboxAnkPay, AnkPayError } from "../../packages/ank-pay/src/index.mjs";

function authorised(request) {
  const expected = process.env.ANK_PAY_SANDBOX_ACCESS_TOKEN;
  if (!expected) return false;
  const header = request.headers?.authorization ?? "";
  return header === `Bearer ${expected}`;
}

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  if (process.env.ANK_PAY_SANDBOX_API_ENABLED !== "true") {
    return response.status(503).json({ error: "SANDBOX_API_DISABLED" });
  }
  if (!authorised(request)) {
    return response.status(401).json({ error: "UNAUTHORISED" });
  }

  try {
    const ankPay = createDefaultSandboxAnkPay();
    const result = await ankPay.createPaymentRequest(request.body);
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof AnkPayError) {
      return response.status(error.httpStatus).json({
        error: error.code,
        message: error.message,
        provider: error.provider,
        providerCode: error.providerCode
      });
    }
    return response.status(500).json({ error: "ANK_PAY_INTERNAL_ERROR" });
  }
}
