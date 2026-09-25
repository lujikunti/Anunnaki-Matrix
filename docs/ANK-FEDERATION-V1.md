# ANK Federation v1

## Purpose
Anunnaki.Live, The General Counsel (GC) and Michael Noah (MN) are sovereign products. Federation is optional. No product is a mandatory runtime dependency of another.

## Fixed inbound/outbound grammar
Every cross-product message uses ANK_FEDERATION_V1. Supported message types are AI_AUDIT_REQUEST / RESULT, TWIN_REQUEST / RESULT, TEACHING_OFFER / DECISION and ERROR.

All incoming messages are external reality. They are contract-validated first and then passed to the receiving product's local admission membrane. Contract validity never equals truth, authority or permission to act.

## Professional Twin invariant
A Professional Twin belongs to one identifiable human professional. A learner, product, organisation, household, generic agent or AI persona cannot be a Professional Twin. MN may train and assess a Twin; GC may calibrate it to organisation/domain practice; neither action transfers the human professional's licence or authority.

## AI Audit
An AI Audit result is evidence-bearing input. GC keeps professional-judgment gates. MN keeps learner/assessment/safety gates. Audit findings may not silently create legal conclusions, learner mastery, official marks or autonomous actions.

## Teaching
Teaching is off by default. Outbound teaching requires explicit opt-in. Inbound teaching lands as a candidate and starts at QUARANTINE or VERIFY. No packet may directly mutate production policy, corpora, authority, permissions or model behaviour.

Network-level learning must be de-identified and must exclude child data, child identity, confidential client material, privileged material and secrets. Product-local or Twin-local learning can retain more context only under that product's own permissions and retention rules.

## Twin Mastery
MN may issue a portable Twin Mastery Passport for demonstrated computational capability. The passport records profession, capability, jurisdiction, corpus version, evidence summary, mastery state and expiry. It is not a licence and does not grant execution authority.

## Fail closed
The public federation API is disabled unless ANK_FEDERATION_API_ENABLED=true and a server-side ANK_FEDERATION_ACCESS_TOKEN exists. Audit/Twin engine URLs are separately configured. The gateway can validate and queue before an execution engine is connected.

## Disconnect rule
GC and MN keep local work, evidence, audits, determinations, review and receipts when Anunnaki is unavailable. Federation requests queue or fail locally without breaking core product functions.
