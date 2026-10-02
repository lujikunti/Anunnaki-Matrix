# PIE Editorial Runtime

Private Node.js service for advisory pre-publication reviews. Deploy this directory as the Vercel project root; do not add the endpoint to the repository's public marketing-site project.

## Endpoint

`POST /api/review` accepts a `PUBLICATION_DRAFT` with verified rights, product (`mn` or `gc`), immutable candidate metadata (`id`, `version`, `content_hash`), and text sections with unique anchors. It returns a structured review with findings and suggested redlines. The response always says `HUMAN_REVIEW_REQUIRED`, `NOT_RELEASED`, `can_publish: false`, and `receipt: null`.

The runtime rejects other classifications, unverified rights, malformed input, duplicate anchors, and oversized requests. It does not connect to MN or GC storage, fetch files, keep a review database, or publish content. Callers should extract only approved publication drafts and send their text over an authenticated private connection.

## Configuration

Set these as encrypted Vercel project environment variables, never in source control:

- `PIE_EDITORIAL_API_TOKEN`: high-entropy bearer token for the caller.
- `OPENAI_API_KEY`: API key for the OpenAI Responses API.
- `PIE_EDITORIAL_MODEL`: optional model identifier; defaults to `gpt-5-mini`.

Use Vercel authentication / private access controls in addition to the bearer token. Restrict the service to authorized editorial operators and internal callers. Disable access logs that capture request bodies; this service does not log document text.

## Local checks

From this directory run `npm test`. Tests mock the model API and do not need secrets or network access.
