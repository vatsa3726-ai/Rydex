# Veyra AI — private development release

HPSV Infra Tech LLP. Actual Next.js application in `apps/models-web`, backed by the shared Fastify API. All characters are fictional adults 21+. The audience is 18+. Experiences remain non-explicit and clearly disclosed as AI. The Veyra launcher explicitly enables its routes; existing SoulNest entry points retain their startup configuration. Shared-server operators can opt in with `VEYRA_ENABLED=true` after configuring Veyra's origin and providers.

## Run locally

From the nested `ai-platform` workspace:

```sh
npm ci
npm run veyra:dev
```

Open http://localhost:3001. The launcher starts Veyra's backend on loopback port 4001 and the website on 3001. SoulNest uses its existing 3000/4000 ports. Development data persists in `.veyra-data` (PGlite); production requires PostgreSQL. Optionally copy `.env.veyra.example` to `.env.veyra`. Do not set `NODE_ENV=production` for development self-attestation.

For a built local preview:

```sh
npm run build -w @aiplatform/models-web
npm run veyra:start
```

In a production environment, use HTTPS, PostgreSQL, and the configured age-assurance gateway below. The website proxies `/api/veyra/*` to `/v1/veyra/*`; the API is not a separate public port in the supplied Render configuration. Set `VEYRA_PUBLIC_ORIGIN` to your exact public origin when using a custom domain; otherwise Render's `RENDER_EXTERNAL_URL` is used. `VEYRA_API_ORIGIN` is a build-time rewrite setting and defaults to `http://127.0.0.1:4001`.

## Implemented

- Responsive charcoal/gold landing, discovery with search/style filters, model profiles, authorized galleries, account, membership, chat/history and Studio admin screens.
- Three original generated portraits: Aria Vale (29), Noor Amani (28), Julian Reed (32). SQL and input validation enforce fictional identity and age 21+ for all profiles. See `apps/api/assets/veyra/PROVENANCE.md`.
- Separate Veyra accounts, scrypt password hashes, opaque hashed seven-day sessions, HttpOnly/SameSite=Strict cookies (Secure in production), origin checks, sign-in/register rate limits and private namespaced `vy_*` PostgreSQL tables. No SoulNest cookie or bearer token grants Veyra access.
- Server-side access checks protect profile lists/details, media and chat. A signup checkbox does not grant production access. Account export, deletion and sign-out remain accessible when age proof expires or restricted access is suspended.
- Independent age-provider gateway contract: pending checks expire after 15 minutes; signed results grant 30 days; timestamp, event deduplication, check ownership/current-reference checks and revocation are implemented. Identity documents and birth dates are not stored by Veyra. Development self-attestation lasts one day, is visibly labelled, and is rejected in production.
- Per-user/model tone, English/Hindi/Kannada language choice and conversational preferences. Persisted text history, bounded recent context, cursor pagination, conversation deletion and duplicate-turn protection.
- Configurable OpenAI-compatible chat adapter with input/output moderation, a 30-second deadline, provider storage disabled, and a bounded completion. Preview mode supplies explicitly labelled scripted replies. Live moderation failures return errors instead of allowing unreviewed output. Safety prompts preserve fictional identity, non-explicit boundaries and real-world autonomy; adversarial safety evaluation is still a launch requirement.
- Persisted daily quotas (20 free / 200 premium by default), premium model/media checks, manually assigned expiring evaluation entitlements. Attempts, retries and provider failures consume quota. No checkout, payment webhook, payment key or charge collection exists.
- Admin-created media is private: production uploads require S3, AES256 encryption and all four bucket Public Access Block flags. Input is limited to 2 MB JPG/PNG/WebP under 20 megapixels; images are re-encoded to strip metadata. Uploaded assets start pending. Publication requires explicit rights, fictional-adult and non-explicit review with a recorded reason. Media responses are authenticated, no-store, and enforce publication/review/premium status.
- Deleting stored gallery media creates a durable cleanup entry. An in-process worker retries unreferenced objects older than ten minutes. A failed upload leaves a cleanup entry. Development may store image bytes in PostgreSQL; production uploads cannot use that fallback. Seed portraits ship with the API and remain behind the same access checks.
- User reports can share an optional, explicit-consent message excerpt (maximum 500 characters), with ownership checks. Admins can resolve reports, publish/unpublish profiles, review media, suspend restricted access, manage evaluation entitlements and see aggregate counts/audit reasons. The dashboard has no endpoint for browsing private transcripts.
- Password-confirmed account deletion cascades active Veyra sessions, conversations, messages, settings, reports, verification records and subscriptions. Veyra deletion does not delete SoulNest data. Backup/provider retention must be configured separately.

## Age-assurance gateway integration — requires a vendor adapter

No independent age vendor is connected in this release. This generic contract is tested with signed fixtures, not with a vendor's production service. The production configuration fails closed until the gateway is configured. The gateway must validate the chosen vendor's actual result and authenticity before signing Veyra's result. Do not pass through an unsigned browser claim.

Configure these server-only settings:

- `VEYRA_AGE_START_URL`: your approved HTTPS gateway session endpoint.
- `VEYRA_AGE_API_KEY`: bearer credential for that gateway.
- `VEYRA_AGE_WEBHOOK_SECRET`: at least 32 characters, shared securely with the gateway. Render generates a secret in the Blueprint; retrieve it securely for gateway setup.
- `VEYRA_AGE_REDIRECT_HOSTS`: comma-separated exact hostnames allowed for the hosted verification flow.
- `VEYRA_AGE_MODE=provider`: also disables local attestation in development when testing a provider.

Veyra POSTs `{reference, minimumAge:18, returnUrl, webhookUrl}` to the gateway, expecting `{url:"https://allowed-provider-host/..."}`. The user returns to `/verify`; URL query parameters cannot grant access. The gateway sends this JSON to the supplied webhook URL:

```json
{
  "eventId": "unique-event-uuid",
  "verificationId": "reference-from-start",
  "status": "verified",
  "over18": true
}
```

`status` is `verified`, `failed` or `revoked`. Include `x-veyra-timestamp` (Unix seconds, within five minutes) and `x-veyra-signature: sha256=<hex HMAC-SHA256>`. Sign the exact bytes `timestamp + "." + rawJsonBody` with the shared secret. Repeated event IDs are idempotent. Superseded, expired, failed or revoked checks cannot be reused to grant verification. A successful check is never inferred from a redirect, card, subscription or checkbox.

By default the callback is `PUBLIC_ORIGIN/api/veyra/age/webhook`. If exposing a separate API intentionally, `VEYRA_PUBLIC_API_ORIGIN` instead selects `API_ORIGIN/v1/veyra/age/webhook`.

## Live AI and storage configuration

Set `VEYRA_AI_PROVIDER=openai`, `VEYRA_AI_API_KEY`, `VEYRA_AI_MODEL`, and optionally `VEYRA_AI_BASE_URL` (HTTPS). The base must implement both chat completions and moderation with the documented response contract; do not substitute a chat-only endpoint. `VEYRA_MODERATION_MODEL` defaults to `omni-moderation-latest`. No keys are exposed to the browser. These credentials have not been supplied or live-tested.

For uploads set `VEYRA_MEDIA_STORAGE=s3`, `VEYRA_STORAGE_BUCKET`, `VEYRA_STORAGE_REGION`, and restricted `VEYRA_STORAGE_ACCESS_KEY` / `VEYRA_STORAGE_SECRET_KEY` (or an approved runtime IAM identity). Grant only the required object operations plus `GetBucketPublicAccessBlock`; block public bucket access. An optional `VEYRA_STORAGE_ENDPOINT` requires equivalent S3 encryption and Public Access Block support. Existing cloud credentials/buckets have not been connected or verified. Shipped generated portraits work without an upload bucket.

## Authorized admin setup

There is no public administrator signup, email allowlist or default password. Register a Veyra account, then use its UUID from My account in a trusted operator shell pointing to the correct database:

```sh
npm run veyra:admin -w @aiplatform/api -- EXISTING_USER_UUID
```

The CLI grants only the admin role and records an audit event. Admins still require valid age proof. For local PGlite, stop that preview before opening the same database with the CLI; use an absolute `VEYRA_DATA_DIR`, because workspace scripts run from `apps/api`. For production set `VEYRA_DATABASE_URL` (or `DATABASE_URL`) to the approved PostgreSQL database. No production admin account has been created in this work.

## Render configuration and remaining launch work

`render.veyra.yaml` creates a separate proposed web service and PostgreSQL database; it does not manage the existing SoulNest Blueprint or root Rydex resources. It uses automatic deploys off, one instance, a private database connection and a combined web/API health check. Build: `npm ci --include=dev`, API typecheck, Next production build. Start: the supervised `veyra:start` launcher. A child exit stops the combined service. Review compute costs before applying the Blueprint.

The file validates against Render's current JSON Schema. No resources were created, deployed or published. The connected Shree workspace was inspected read-only and contains no Veyra service. Deployment validation against a live Render plan and a verified public URL are still outstanding.

Before public launch, connect and validate the independent age gateway, live AI/moderation, private S3 storage and managed PostgreSQL; provision an authorized operator; add verified-email/password recovery, operator MFA, monitoring/alerting and backup/restore/retention procedures; evaluate safety/accessibility/load behaviour; and finalize privacy/terms and jurisdiction-specific requirements with qualified reviewers. Payment collection requires separate payment-provider approval and verification of applicable legal requirements. This release makes no claim of legal compliance, independent user verification or live moderation-service approval.

## Validation

```sh
npm test -w @aiplatform/api
npm run typecheck -w @aiplatform/api
npm run build -w @aiplatform/models-web
npm run build -w @aiplatform/companion-web
npm test -w @aiplatform/soulnest-mobile
npm audit --omit=dev
# At repository root, legacy regression tests:
npm test
```

Verified locally: 12 API tests (including four Veyra integration/security suites), two SoulNest mobile tests, five legacy Rydex tests, both website production builds, API typecheck and dependency audit with zero reported vulnerabilities. Browser QA in Edge Chromium covers signup, access denial before proof, a local development age fixture, protected generated portraits, discovery search, saved preferences, chat, reload-persisted history, disabled payments and desktop/390px layouts, with no page runtime errors. Tests use synthetic accounts and mock age/AI/storage services; they do not prove live provider connectivity or a public deployment.

References checked during implementation: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render environment variables](https://render.com/docs/configure-environment-variables), [OpenAI moderation contract](https://developers.openai.com/api/reference/resources/moderations/methods/create).
