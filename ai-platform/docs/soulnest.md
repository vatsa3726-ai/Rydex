# SoulNest companion milestone

The SoulNest implementation is isolated inside this directory. Legacy Rydex and Veyra are unchanged.

## Run locally

From `ai-platform/`, run `npm ci`, then start the API with `npm run dev -w @aiplatform/api` and the website in a second terminal with `npm run dev -w @aiplatform/companion-web`. Open http://localhost:3000. Set SOULNEST_API_ORIGIN in the companion-web process environment (or its .env.local) before building if the API is not at http://127.0.0.1:4000. The root example env file is documentation; it is not automatically loaded by the API.

Check with `npm test -w @aiplatform/api`, `npm run typecheck -w @aiplatform/api`, and `npm run build -w @aiplatform/companion-web`.

## Behavior and integration contract

- Five fictional AI styles: father, mother, sister, brother and friend. All roles stay non-sexual and non-romantic. The UI and opening message disclose AI identity.
- Replies currently come from a deterministic PreviewProvider. They are not live model output. The CompanionProvider interface receives the system boundaries, recent conversation and consented notes. Inject an implementation into buildApp to integrate a model. Never put provider credentials in the browser.
- POST /v1/soulnest/sessions accepts a role and returns an opaque bearer capability token. Every subsequent session, chat and memory operation requires that token. Tokens remain only in page memory, never localStorage or URLs. HTTPS is required outside localhost.
- POST /chat accepts up to 40 user/assistant messages, each at most 2000 characters. The browser supplies recent history; the API does not retain transcripts. Role choice and system instructions are server controlled. Client history is untrusted and is not an authoritative audit record.
- GET /memories lists consent and saved notes; PUT /consent accepts {enabled:boolean}; POST /memories accepts {text:string}; DELETE /memories/:id forgets one note. Consent is off by default; revocation deletes all notes. Saving is explicit, never inferred from a chat. Limits: 20 notes, 300 characters each. DELETE /session revokes the token and clears its data.
- This preview uses process-local sessions with a one-hour inactivity expiry and periodic cleanup. Refresh loses access; restart loses all data. It does not implement durable personal memory. Data already sent for an in-flight reply cannot be recalled by revoking consent.
- No request logging is enabled for this API. Avoid adding logs containing messages, tokens, or memories.

## Before a public release

Add authenticated account ownership, per-user/IP rate limits, durable session storage, encrypted memory storage and deletion/retention jobs before scaling beyond one process. Keep consent version, scope, timestamp and revocation attached to account-owned memory records; re-check consent at retrieval time and never automatically migrate preview notes into permanent storage. Add a user-visible export/delete-account flow and test account isolation.

A live model requires input/output safety moderation, adversarial tests for family-role boundaries and prompt injection, provider timeouts, cancellation, usage limits and documented provider retention. The preview keyword branches are demonstrations, not comprehensive safety detection. The system policy forbids impersonating real relatives, exclusivity, coercion, secrecy, or replacing human relationships and professional care. Do not connect an unrestricted provider or market this preview as therapy or crisis support.

## Validation for this milestone

API integration tests cover invalid roles and message roles, unauthorized access, cross-session memory isolation, opt-in enforcement, consent withdrawal, session deletion, system boundaries, AI identity disclosure, preview safety responses, and provider error handling. API type checking and the SoulNest production build passed on Windows with Node 24. The lockfile makes the workspace install reproducible.

The dependency audit currently reports two inherited advisories involving Next.js/PostCSS (one moderate and one high). Resolve those before public launch; the audit suggests a framework major upgrade, which is outside this isolated companion milestone. No deployment or live AI provider connection was performed.

An HTTP smoke check also passed against the production website: page rendering, the same-origin API proxy, session creation for all five roles, preview chat, and session deletion. Browser interaction and visual layout were not manually verified.
