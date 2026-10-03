# ANK Federation v2 — 25 September 2026

Anunnaki, The General Counsel (GC) and Michael Noah (MN) are sovereign products. Federation is optional and fail-closed.

## Contract
Live messages use `ANK_FEDERATION_V1` contract version `2026-09-25.2`:
- AI_AUDIT_REQUEST / AI_AUDIT_RESULT
- TWIN_REQUEST / TWIN_RESULT
- TEACHING_OFFER / TEACHING_DECISION
- ERROR

Messages are HMAC-SHA256 signed with explicit key ID, nonce and expiry. GC and MN maintain durable nonce ledgers and reject replay. Anunnaki Matrix's current reference gateway has an instance-local replay cache; the actual Anunnaki.Live runtime must attach a durable store before external production federation is enabled.

## Professional Twin
A Twin binds to one identifiable human professional. Learners, products, organisations and generic agents are not Twins. The reference provisioner creates a stable Twin reference with requested capabilities marked UNASSESSED and an authority ceiling of OBSERVE_ONLY_UNTIL_MASTERY_AND_LOCAL_GRANT.

## Audit
The reference gateway executes a bounded governance/evidence audit. It is explicitly not the substantive Anunnaki AI Audit engine and cannot replace professional judgment. A substantive audit engine may be connected behind the same contract later without changing GC/MN's admission rules.

## Teaching
Teaching is candidate-only. Network export must be explicit, de-identified and free of child data, confidential client material, privileged material and secrets. Pair-specific GC/MN credentials are supported. Anunnaki can deliver a safe teaching candidate to each product's signed inbound membrane; the receiving product quarantines it.

## Sovereignty
GC and MN require durable local recording before outbound federation work leaves the product. Returned Audit/Twin/Teaching data enters VERIFY/QUARANTINE and cannot grant local authority or silently mutate policy.

## Production activation
Reference code is deployed fail-closed. Production interaction requires pair access/signing secrets and product server-side Supabase secret keys. The public anunnaki.live Professional Twin runtime is currently a separate runtime from this Anunnaki-Matrix reference API and must adopt this same contract rather than bypass it.
