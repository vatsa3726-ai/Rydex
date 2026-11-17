# SoulNest MVP — setup and release notes

SoulNest lives in apps/companion-web and the shared apps/api. Legacy Rydex source, its root Render Blueprint, and Veyra source are preserved. The workspace overrides Next's PostCSS dependency to patched 8.5.33; both web builds are checked after this shared dependency change.

## Local use (Node 24)

From ai-platform/: run npm ci, then npm run dev -w @aiplatform/api in one terminal and npm run dev -w @aiplatform/companion-web in another. Open http://localhost:3000. Registration, login, profiles, photos, messages and consented notes work without cloud credentials. The API creates a private local PostgreSQL database in apps/api/.soulnest-data by default. Do not commit or share that directory. For a production-built local UI, run npm run build -w @aiplatform/companion-web and then node scripts/start-soulnest.mjs with NODE_ENV=development. The supervisor stores local data relative to ai-platform/.

The example .env file is documentation. Export variables in your shell or use a local env-file loader for the API; do not assume it automatically reads .env. Next reads apps/companion-web/.env.local. SOULNEST_API_ORIGIN is read at web build time; the combined Render service uses the default loopback origin. Do not change the internal API port without rebuilding the rewrite.

## Live AI and speech

Set AI_PROVIDER=openai, AI_PROVIDER_API_KEY and AI_CHAT_MODEL to an approved available chat model. The adapter uses POST /chat/completions with bounded history and max_completion_tokens. AI_BASE_URL defaults to https://api.openai.com/v1; a compatible alternative must support the moderation and audio endpoints too. Set AI_MODERATION_MODEL if you need a different approved moderation model. Every reply is input- and output-moderated before display; malformed moderation results fail closed. A shared 30-second deadline bounds a chat turn. Run live adversarial, family-boundary, distress and language evaluations before launching.

For voice, also set AI_STT_MODEL and AI_TTS_MODEL to models supporting the corresponding transcription/speech endpoints and built-in voices. The browser records for at most 45 seconds, asks permission, and presents a transcript for review. Recordings are not stored in our database; the provider's retention terms still apply. Speech quality in English/Hindi/Kannada and microphone behavior must be tested on target devices. Custom voice cloning is not exposed. Output streaming and full-duplex real-time calls are deferred so moderated output is checked before display.

Provider API references: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create ; https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create ; https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create

## Storage, accounts and privacy

Production requires DATABASE_URL and an HTTPS PUBLIC_ORIGIN (or Render's RENDER_EXTERNAL_URL). Use a separate managed PostgreSQL instance; all tables are namespaced sn_ and migrations are additive. On Render the Blueprint wires the internal database URL. External database connections must use verified TLS. No request bodies, tokens or conversations are logged. Cookies are HttpOnly, SameSite=Strict and Secure in production; the database stores only hashed session tokens and scrypt password hashes. Sessions expire after seven days. Owner checks guard every object operation. Origin and JSON checks protect mutations. The anonymous v1 SoulNest preview is retired when durable account routes are active.

Private image blobs stay in the account database behind owner-checked routes; no public object URLs are issued. Only JPG/PNG/WebP are accepted, capped at 2 MB/20 MP and re-encoded to remove metadata. Permission is an explicit timestamped user attestation; identity/likeness authorization is not independently verified. Photos are not sent to the chat model. No image-based identity recreation occurs.

Memory defaults off per companion. Each opt-in records version and timestamp. Only explicitly saved notes are retrieved; chat history is independent. View/edit/forget/revoke controls are provided. Revocation deletes saved notes, not copies typed in history; Clear conversation removes history and duplicate-turn records. In-flight provider requests cannot recall context already sent. Deleting a companion cascades to photos/messages/notes. Account deletion requires the password and cascades through all active account records. Infrastructure backups and provider data require separate operational retention/deletion policies; confirm those before launch.

The MVP uses 18+ self-attestation, not verified age assurance. Family/mentor/custom roles stay platonic and every role is non-explicit. No real-person or deceased-person impersonation, dependency or exclusivity is authorized by customization. The policies and moderation reduce risk but do not prove model behavior safe. Email verification, password reset/recovery, stronger age assurance and abuse operations remain release work. Until then, treat this as a private MVP, not a public launch.

## Plans and usage

Free limits are configurable via FREE_DAILY_MESSAGES and FREE_DAILY_VOICE (positive integers, at most 10000). Companion cap is 3. Premium plan metadata and subscription tables are prepared, but no upgrade route, payment keys, checkout or live billing exist. Premium pricing/provider approval is still required. Daily quotas are enforced in the database across processes. Requests that reach processing count, including failures/retries; a duplicate requestId never creates duplicate messages. The per-minute rate limiter is process-local. Signup/login IP limiting shares the loopback address behind this single-service proxy; implement trusted-edge client attribution/distributed limits before scaling or opening enrollment widely. The Blueprint deliberately uses one instance.

## Render

Use ai-platform/render.soulnest.yaml, NOT the root Rydex render.yaml. It proposes one Node web service and one separate PostgreSQL instance in the same region. Next serves the website and proxies to a loopback-only API in the same service; a database-aware health route verifies readiness. The supervisor forwards shutdown and fails if either process exits. The service uses Render's external URL as the allowed browser origin; set PUBLIC_ORIGIN to an exact custom HTTPS origin if adding a custom domain. No local database fallback is permitted in production.

The Blueprint has been checked against Render's current public JSON Schema (the validator ignores an unused URI format for maintenanceMode). Render CLI is not installed here. Platform planning is separate from schema validation. Planning uses create_new, never adopts existing resources; auto-sync and automatic deploys are disabled. Applying the reviewed plan can incur service/database charges and requires a separate decision. AI remains in labelled preview mode until credentials/models are set privately in the service's Environment panel. No secrets are in the Blueprint.

Current Render references: https://render.com/docs/blueprint-spec ; https://render.com/docs/compute-plans ; https://render.com/docs/configure-environment-variables ; https://render.com/docs/environment-variables ; https://render.com/docs/private-network

## Checks

npm test -w @aiplatform/api
npm run typecheck -w @aiplatform/api
npm run build -w @aiplatform/companion-web
npm run build -w @aiplatform/models-web
npm audit --omit=dev

The SoulNest GitHub workflow runs these checks on relevant changes. The legacy Rydex security suite remains runnable from the repository root with npm test. See mvp-milestones.md for milestone features, files, validation and remaining work.
