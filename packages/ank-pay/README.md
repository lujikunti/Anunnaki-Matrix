# ANK Pay v0.3 — Peach PayShap Verified Lifecycle

ANK Pay is shared payment orchestration infrastructure for Anunnaki Matrix products. Michael Noah, The General Counsel and future ANK products consume ANK payment and entitlement events; they do not import provider-specific code.

```text
MN / GC / future ANK products
        |
        v
   ANK Pay engine
   /            \
ledger        provider adapter
  |               |
private DB      Peach sandbox today
  |             Stitch / direct bank later
  v
sandbox entitlement gate
```

## v0.3 rule: webhook is a signal, not settlement

Peach PayShap is asynchronous. ANK Pay may receive a webhook before, after or more than once relative to the customer redirect. ANK Pay therefore treats an authenticated webhook as a **reconciliation signal only**.

A webhook may locate the payment and append an audit event. It can never directly activate MN, GC or another ANK entitlement. ANK Pay must independently query Peach's payment status, verify provider identity + transaction identity + amount + currency + `PAYSHAP`, and only then mark settlement verified.

## Settlement Proof receipt

After independent verification confirms success, ANK Pay issues an internal `ANK.PAY.PROOF.RECEIPT.V1` receipt. The receipt contains payment/settlement identity, entitlement state, event digest and the verification rule set, then hashes the complete canonical receipt with SHA-256.

The database independently blocks a settlement receipt unless the recorded payment is already `succeeded` and has `settlement_verified_at`.

Webhook plaintext is not retained. The webhook inbox stores only reconciliation fields and a SHA-256 hash of the raw provider message.

## v0.2 rule: settlement must be verified

A provider create response, redirect, return URL or webhook is **not** proof of settlement. ANK Pay grants a sandbox entitlement only after a provider status query independently returns a successful state and the returned provider identity, transaction identity, amount, currency and PayShap brand match the recorded payment.

Peach webhooks are treated as hints because asynchronous payment states can arrive out of order and can later change. A webhook can update the audit trail, but it cannot directly grant access.

## Idempotency

Every product payment intent supplies an `idempotencyKey`. The ledger stores a fingerprint of the payment terms. Replaying the same key with the same terms returns the original payment without calling the provider again. Reusing the key for changed terms fails with `IDEMPOTENCY_CONFLICT`.

Raw payer cellphone numbers are not included in the fingerprint material stored by ANK Pay; a SHA-256 fingerprint is used for comparison.

## Durable sandbox ledger

`schema/ank-pay-sandbox-v0.2.sql` plus the incremental `schema/ank-pay-sandbox-v0.3.sql` define a private Postgres sandbox with:

- payments;
- payment events/audit history;
- sandbox entitlements;
- reconciliation issues;
- authenticated webhook inbox metadata (no raw webhook body retention);
- tamper-evident payment Proof receipts;
- an internal reconciliation snapshot for operator views;
- atomic idempotency claim;
- provider-result recording;
- verified-settlement transition;
- verification-failure recording;
- verified-entitlement gate.

The schema revokes access from `PUBLIC`, `anon` and `authenticated`. It is backend infrastructure, not a browser Data API. The current sandbox copy is hosted in an existing ANK Supabase project only for prototype verification; the ledger adapter is portable so a dedicated ANK infrastructure database can replace it without changes to MN or GC.

## Provider boundary

The current adapter remains hard-locked to Peach's official Payments API sandbox endpoint. Peach recommends Orchestration for new production integrations, so this adapter is intentionally a fake-money proving rail, not the permanent production integration.

Future adapters must implement the same provider contract:

- `createPaymentRequest(input)`
- `getPaymentStatus({ providerReference })`

Products never consume Peach transaction objects directly.

## Peach sandbox E2E

`tools/e2e-ank-pay-peach.mjs` performs a fake-money PayShap flow against Peach's documented sandbox simulator:

1. create a R1.00 payment using the success simulator number;
2. assert create does not grant settlement;
3. independently query transaction status (maximum two status queries in the script);
4. verify transaction identity and amount;
5. require `settlementVerifiedAt`;
6. require exactly the sandbox entitlement produced by the verified settlement gate.

The GitHub Actions E2E job uses Peach's publicly documented example sandbox credentials only. No merchant/live credential is committed.

## Stable product intent

```js
const result = await ankPay.createPayment({
  idempotencyKey: "family-001-2026-09-mn-family",
  productKey: "mn-family-monthly",
  subject: { type: "family", id: "family-001" },
  amountMinor: 25000,
  currency: "ZAR",
  reference: "MN-family-001-september",
  returnUrl: "https://example.com/payments/return",
  payer: { bank: "FNB", cellphone: "0711111200" }
});
```

The public result is provider-neutral: ANK payment id, status, provider reference, reconciliation id, amount, product/subject, settlement verification timestamp and optional sandbox entitlement.

## Still deliberately excluded

v0.3 is still not a live payments release. It has:

- no live-money endpoint;
- no production Peach/Orchestration credential;
- no card-number collection or storage;
- no production MN or GC entitlement mutation;
- no recurring/subscription engine yet;
- no refund engine yet;
- Payments API AES-256-GCM webhook verification primitives, but no webhook endpoint is enabled until a merchant webhook secret and durable runtime wiring exist;
- no claim that Vercel production is current until deployment is independently verified.

The existing Vercel prototype API remains disabled by default. v0.2 first proves the payment lifecycle and persistence contract before product checkout depends on it.
