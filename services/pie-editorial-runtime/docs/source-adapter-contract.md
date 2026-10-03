# PIE source adapter contract

This document defines the safe boundary for connecting the Editorial Desk to MN and GC. The service currently accepts submitted text; it does not connect to either product repository or read Drive.

## Shared rules

- A source adapter submits only a named publication candidate, never a repository-wide crawl.
- Candidate text must be intended for publication and cleared for the review purpose under the product's trusted rights workflow.
- Send only text required for editorial review. Exclude learner records, private correspondence, client matters, privileged material, reviewer identity records, credentials, and operational-only configuration.
- Record the source repository, immutable commit, path, product record ID, version, and content hash with every review.
- Any source edit invalidates the review result. Re-review the new hash; never copy an older result to a changed version.
- PIE findings and redlines are advisory. Existing product legal, curriculum, safety, rights, professional, and release authorities remain in force.
- A candidate stays unreleased until the product's own authorised people complete their human gates. A PIE review response is not a receipt or release approval.

## MN adapter

Use `config/publication-classification-v1.json` and its exact `config/publication-manifest-v1.json` allowlist as the starting boundary. The classification default is `INTERNAL_UNTIL_EXPLICITLY_PUBLIC`; absence from the allowlist means do not submit. Exclude the listed internal operations and all private learner/customer data. Review only prose-bearing candidate files, not code bundles, analytics, or identity/reviewer operations.

An allowlist entry establishes public-runtime classification, not by itself proof that every asset or third-party source is rights-cleared. The adapter must require trusted rights evidence before submitting a candidate.

## GC adapter

Use `config/gc-library-catalogue-v1.json`, `config/gc-legal-source-registry-v1.json`, and `config/public-release-contract-v1.json` together. A catalogue record identifies the publication and its data source; the release contract identifies critical public routes; the legal source registry carries legal review state. Submit only the text belonging to a named publication record and only after its rights workflow permits the review transfer.

Never submit `dist-ank-internal/`, client or matter material, pilot case records, or internal reviewer data. Do not translate an AI review into `legally_reviewed`, `COMPLETE`, `field_verified`, `transaction_verified`, `Publication Master`, or commercial-release status. GC's legal and professional review stays with authorised humans.

## Activation sequence

1. Deploy the service as a private project and configure its secrets.
2. Add a named, least-privilege caller identity for each repository adapter. The current shared bearer token is suitable only for a protected alpha desk; production adapters must bind the caller to repository, product, and permitted candidate paths.
3. Implement and test each adapter against its authoritative catalogue and release files.
4. Add the adapter check to the existing pre-release path and make it required only after the endpoint and secrets are verified.
5. Confirm that the model receives only the expected candidate text, and that every report is bound to the source commit and content hash.
