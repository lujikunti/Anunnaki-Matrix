# ANK Publishing Engine V1

## Boundary

The engine is common infrastructure beneath Michael Noah (`mn`) and The General Counsel (`gc`). It does not create a third customer-facing brand and it does not merge product editorial rules.

Canonical hierarchy:

`authoring source → product adapter → governed registry → build artifact → deployment → production verification`

A source file is not a publication. A registry record is not a deployment. A deployment is not production verification.

## V1 primitives

The package owns stable contracts for content identity, workflow/publication status, release truth, rights/provenance, assets, product-scoped search, entitlement decisions, version chains, audit events and machine-readable release manifests.

Product repositories own their adapters and presentation skins. They may migrate incrementally. Legacy imports default to `IN_PRODUCTION + RIGHTS_REVIEW + RIGHTS_UNCLEAR + LEGACY_REVIEW_REQUIRED` unless a product adapter supplies stronger evidence.

## Product isolation

Every content and asset object has exactly one `product` namespace. Search requires an explicit product scope and filters out the other product before text matching or entitlement checks. Product extensions live under `extensions.mn` or `extensions.gc`; cross-product extensions are rejected.

## Rights and AI-use separation

Publication clearance is not an AI licence. Asset ledgers should track separately: end-user publication, text/data mining, embeddings, retrieval, fine-tuning, model training, commercial corpus licensing, partner access and internal AI use. `RESTRICTED` and `RIGHTS_UNCLEAR` assets fail publication clearance.

## Access boundary

The engine returns an allow/deny decision and reason. UI hiding is never authorization. Product applications must enforce the decision at the server/data layer. Family and organisation relationships are explicit inputs; broad roles do not imply household or organisation membership.

## Database migration rule

MN and GC currently operate separate product databases. V1 does not merge them. Shared data tables may be introduced only through captured migrations, RLS review, regression tests and product-by-product cutover. Child/family data and professional/legal data stay isolated unless a later architecture decision explicitly proves a safe shared boundary.

## Vendoring during migration

Until the engine is published as a separately versioned package with reliable CI distribution, product repositories may consume a pinned generated snapshot. The snapshot must carry the upstream repository, version and source commit. Product code must not hand-edit the vendored engine; changes originate here and are re-vendored deliberately.
