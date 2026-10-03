# PIE Editorial Runtime

Private Node.js service and editor screen for advisory pre-publication reviews. Deploy this directory as the Vercel project root; do not add it to the repository's public marketing-site project.

## Editor screen

Open `/` after deployment. Reviewers can paste a draft or open a Markdown/plain-text file, choose MN or GC, request a section-anchored review, and download a Markdown report. The access token is entered by the reviewer, held only for the page session, and cleared when the page is left. The original draft is not modified or stored by the interface.

The editor screen supports `.md`, `.markdown`, and `.txt` files up to 300 KB. Blank lines mark review sections. The current API accepts at most 40 sections, 12,000 characters per section, and 300,000 characters total.

## Endpoint

`POST /api/review` accepts a `PUBLICATION_DRAFT` with verified rights, product (`mn` or `gc`), candidate metadata (`id`, `version`, `content_hash`), and text sections with unique anchors. It returns a structured review with findings and suggested redlines. The response always says `HUMAN_REVIEW_REQUIRED`, `NOT_RELEASED`, `can_publish: false`, and `receipt: null`.

The rights checkbox and request field record the submitting editor's attestation; they do not verify rights evidence. Rights approval must remain in the product's trusted rights workflow. The runtime rejects other classifications, malformed input, duplicate anchors, and oversized requests. It does not connect to MN or GC content stores, fetch files, keep a review database, or publish content. Callers should extract only approved publication drafts and send their text over a protected connection.

## Configuration

Set these as encrypted Vercel project environment variables, never in source control:

- `PIE_EDITORIAL_API_TOKEN`: high-entropy bearer token for authorized reviewers and callers.
- `OPENAI_API_KEY`: API key for the OpenAI Responses API.
- `PIE_EDITORIAL_MODEL`: optional model identifier; defaults to `gpt-5-mini`.

Use Vercel authentication / private access controls in addition to the bearer token. Restrict the service to authorized editorial operators and internal callers. Disable access logs that capture request bodies; this service does not log document text. Do not use a shared token as a substitute for named reviewer identity in future approval workflows.

## Local checks

From this directory run `npm test`. Tests mock the model API and do not need secrets or network access.
