# ANK Pay v0.1 — Peach PayShap Sandbox

ANK Pay is shared payment orchestration infrastructure for Anunnaki Matrix products.

## Boundary

Products such as Michael Noah and The General Counsel call the ANK Pay contract. They do **not** import Peach-, Stitch-, bank-, card- or PayShap-specific logic.

```text
MN / GC / future ANK products
        |
        v
      ANK Pay
        |
        +-- Peach PayShap sandbox adapter (v0.1)
        +-- Stitch adapter (future)
        +-- direct-bank adapter (future)
        +-- other regulated PSP adapter (future)
```

The v0.1 Peach adapter is intentionally **sandbox-only**. It contains no live endpoint and cannot move real money.

## Why the adapter is isolated

Peach's current documentation says new integrations should use Peach Orchestration, while its public PayShap simulator instructions remain documented on the Payments API. v0.1 therefore uses the documented Payments API sandbox solely as a test adapter. When Peach provides the current PayShap Orchestration schema/credentials, add a new adapter behind the same ANK Pay contract rather than changing MN or GC.

## Stable caller contract

```js
const result = await ankPay.createPaymentRequest({
  amountMinor: 25000,
  currency: "ZAR",
  reference: "family-subscription-2026-09",
  returnUrl: "https://example.com/payments/return",
  payer: { bank: "FNB", cellphone: "0711111200" },
  metadata: { product: "mn", familyId: "..." }
});
```

Provider-specific responses are normalised to an ANK result with `provider`, `providerReference`, `merchantTransactionId`, `status`, `providerCode`, `providerDescription`, and an optional `action`.

A caller must grant access only after an independently verified `succeeded` state. A redirect or initial request is not proof of settlement.

## Sandbox environment variables

Keep these server-side only:

- `PEACH_SANDBOX_ENTITY_ID`
- `PEACH_SANDBOX_USER_ID`
- `PEACH_SANDBOX_PASSWORD`
- `ANK_PAY_SANDBOX_ACCESS_TOKEN` (protects the prototype API)
- `ANK_PAY_SANDBOX_API_ENABLED=true` (explicit kill switch)

Do not expose any of them to browser JavaScript or commit them to GitHub.

## Official Peach PayShap simulator numbers

- success: `+27-711111200`
- declined: `+27-711111160`
- expired: `+27-711111140`
- connector error: `+27-711111107`

## Deliberate v0.1 exclusions

- no live-money endpoint;
- no card collection or card-number storage;
- no subscription ledger yet;
- no entitlement mutation yet;
- no persistence/idempotency database yet;
- no webhook-driven access grant yet;
- no refunds in the ANK contract yet.

These boundaries prevent a sandbox proof from being mistaken for production payments infrastructure.
