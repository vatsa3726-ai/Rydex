# SoulNest 0.3 release completion

HPSV Infra Tech LLP. Mobile-first React Native / Expo SDK 58 / TypeScript application, with a compatible Next.js client and the shared Fastify/PostgreSQL backend. Veyra and legacy Rydex source are preserved.

## Features completed in this release

- Native and browser email-verification and password-recovery screens, a server-only Resend adapter, random one-time tokens stored as hashes, verification expiry (24 hours), reset expiry (30 minutes), purpose/address binding and replay protection. Production companion access requires verified email; account export/deletion and security controls remain available while verification is pending. Requests return generic account-email responses, with per-address persisted quotas and route limits.
- Password changes and sign-out across devices revoke all server sessions. Incorrect current passwords do not clear a valid session. Native 401 handling checks the token used by each request; browser refreshes discard stale responses after session changes.
- Real persisted premium evaluation entitlements with expiry. Companion, chat and voice limits use the current server-side plan. An expired grant falls back to free limits without deleting private companions. Pricing, checkout and payment collection remain disabled.
- Native account-data export through the OS share sheet, with explicit acknowledgement that it contains private records/photos. Temporary export files are deleted after the share flow. Browser download includes owned companions, conversations, notes, authorization/verification metadata, subscription and reports; hashes/session credentials are excluded.
- Private reporting on AI replies. Reporters choose their details and whether to share an excerpt (up to 500 characters); sharing starts off. Ownership is checked server-side. Authorized operator tools can review and resolve reports without a general private-transcript dashboard.
- Android preview connection settings for an emulator, trusted LAN server or HTTPS backend. A server change signs out locally and attempts old-session revocation before switching. Health checks carry no account credentials. Invalid stored addresses clear the old token. Store builds do not expose this override and require HTTPS.
- All twelve relationship choices in both clients; the web Friend option was added. Saved memory is included in input moderation, and spoken conversation availability requires the chat model as well as speech configuration. Existing AI identity disclosure, platonic family/custom/mentor boundaries, non-explicit adult styles and consent-based memory/photo controls remain.
- Updated compatible Expo patches and native sharing support. App version 0.3.0 / version code 2. A repeatable browser workflow exercises verification, Friend creation, Kannada sample chat, persisted history, memory consent, report consent, export and password changes/recovery at desktop and 390px widths.
- Public configuration-readiness diagnostics, sanitized production logs, explicit configurable proxy trust and tests against spoofed forwarded addresses. The single-service Render proposal runs website/API together and uses private PostgreSQL; no infrastructure or billing is activated by the files.

## Run and try it

From the nested `ai-platform` workspace:

```sh
npm ci
npm run dev -w @aiplatform/api
# Another terminal:
npm run dev -w @aiplatform/companion-web
# Native development:
npm start -w @aiplatform/soulnest-mobile
```

The website is http://localhost:3000. Local text replies are labelled samples until live AI is connected. The API uses local durable PGlite in development and requires `DATABASE_URL` in production. For a built combined preview use `npm run build -w @aiplatform/companion-web`, then `npm run soulnest:start` from the workspace. The existing Veyra preview remains on port 3001.

For a physical Android phone using the LOCAL PREVIEW APK, open **Connect this preview to my server**. Enter the reachable trusted computer address ending in `/v2/soulnest`, for example `http://192.168.1.10:4000/v2/soulnest`. That address is an example, not an assigned address. The Android emulator default is `http://10.0.2.2:4000/v2/soulnest`. The development API must listen on the selected interface and the phone must be able to reach it. Use test accounts on a trusted network for local HTTP; it is unencrypted. Production builds require a verified HTTPS backend.

Do not open a private MVP publicly just to work around missing email, provider or storage configuration.

## External configuration still required

The user deferred the final domain and support email; both remain configurable and no addresses have been invented.

| Capability             | Required configuration / verification                                                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed backend        | Approved Render resources and PostgreSQL, or an equivalent approved host; a verified HTTPS URL. The supplied Blueprint is a proposal, not a deployment.                                                                                                                                                  |
| Account email          | `SOULNEST_EMAIL_PROVIDER=resend`, server-only `SOULNEST_EMAIL_API_KEY` and an authorized `SOULNEST_EMAIL_FROM` sender. Delivery must be verified. Tokens are sent as plain-text email and a link using a URL fragment, rather than server query parameters.                                              |
| Chat                   | Server-only `AI_PROVIDER=openai`, `AI_PROVIDER_API_KEY`, `AI_CHAT_MODEL`, optionally `AI_BASE_URL` and `AI_MODERATION_MODEL`. Live input/output moderation and language/safety evaluation are required; mock tests do not prove live behaviour.                                                          |
| Voice                  | The chat settings above plus `AI_STT_MODEL` and `AI_TTS_MODEL`. Built-in synthetic voices only. This is turn-based recording/transcription/reply/playback, not a full-duplex telephone call.                                                                                                             |
| Private photos         | `PHOTO_STORAGE=s3`, `OBJECT_STORAGE_BUCKET`, region and restricted server-side storage credentials/IAM. All public-access-block flags and encrypted writes are required. Existing local private blobs remain supported for development.                                                                  |
| Public origin          | Exact canonical HTTPS `PUBLIC_ORIGIN`; Render's `RENDER_EXTERNAL_URL` is the fallback. The native client uses `HTTPS_ORIGIN/v2/soulnest`. Configure `SOULNEST_SUPPORT_EMAIL` when chosen.                                                                                                                |
| Proxies and operations | Audit the actual proxy chain, then set `SOULNEST_TRUST_PROXY_HOPS` accordingly. Default 0 trusts no forwarded addresses. Configure log/backup retention, monitoring and restore tests before launch; one instance is proposed because per-minute rate limits are process-local.                          |
| Signed store builds    | The user confirmed Expo/EAS and Apple Developer accounts are not set up yet. Real accounts/project, confirmed identifiers and distribution URL; Apple Developer/team/signing and App Store Connect for TestFlight; Play Console/signing/store metadata for Google Play. No store publication is claimed. |

Set secrets in the hosting/EAS secret configuration, never in `EXPO_PUBLIC_*`, Git, screenshots or chat. No real email, AI, speech or cloud storage request was made by the automated tests.

## Authorized operator commands

Use a trusted operator shell against the intended database. Set `DATABASE_URL`, or an absolute `SOULNEST_DATA_DIR` for an offline local database (stop that PGlite server first). Do not point a test at a production database.

```sh
npm run soulnest:operator -w @aiplatform/api -- grant USER_UUID premium 30 "Approved evaluation"
npm run soulnest:operator -w @aiplatform/api -- grant USER_UUID free 1 "Evaluation finished"
npm run soulnest:operator -w @aiplatform/api -- reports
npm run soulnest:operator -w @aiplatform/api -- resolve REPORT_UUID resolved "Reviewed and addressed"
```

There is no public self-upgrade or administrator bootstrap endpoint. Grants and report review are audited. Account deletion removes targeted operator audit records as well as owned active data. Keep operator reasons free of sensitive personal information.

## Verification and distribution status

Local API/native type checks, Expo compatibility validation and Expo Doctor 20/20 passed. Android/iOS bundle exports and the browser production build passed during development. The browser walkthrough passed using synthetic accounts and mocked email delivery. The final 16 API tests and two native transport tests pass locally, including restart persistence. An earlier parallel run encountered ENOSPC; only this task’s generated caches and orphaned temporary database were cleaned. The API/browser test harness clears database, email, storage and AI service settings and uses embedded test data; API tests run serially to reduce peak memory/disk pressure. The final CI and native APK details will be recorded below after they complete.

A compiled APK is different from a JavaScript bundle export. A debug/test-signed local preview is different from a store-signed release. No EAS cloud, signed iOS/TestFlight, Play/App Store release or public deployment is claimed until verified.

Stronger age assurance, independent real-person authorization, live model/language/safety checks, physical-device microphone/photo/notification tests and production operational/privacy review remain launch work. Streaming/full-duplex speech and remote push are not part of this turn-based, local-reminder MVP. No real-person voice cloning or payment collection is enabled.
