# SoulNest MVP milestone log

## 1 — Accounts and companion creation

Implemented a warm responsive landing page, signup/login, private dashboard, companion creation and editing, relationship/personality/language preferences, account deletion, and disabled premium plan presentation. Account access uses scrypt password hashes, hashed session capabilities in HttpOnly SameSite cookies, origin checks, validation, and auth rate limits. All users self-confirm 18+; this is not verified age assurance. PostgreSQL tables are namespaced sn_; local development uses persistent embedded PostgreSQL (PGlite), production requires DATABASE_URL. Rydex and Veyra are unchanged.

Files: apps/api/src/{database,auth,mvp}.ts, app/server integration, companion-web/app UI and components, workspace dependencies and lockfile.

Validation: four API tests passed, API type checking passed, web TypeScript checking and production build passed. Render deployment not activated. Email verification and password recovery remain unconnected; this is a private MVP until those are implemented.

## 2 — Configurable AI chat and private history

Implemented server-owned conversation history, pagination, deletion, contextual personality prompts, duplicate-turn protection, and an OpenAI-compatible chat adapter with input/output moderation, a 30-second provider timeout and response limits. History and saved customization never become system instructions. The UI clearly identifies English sample replies when no live provider is configured. Streaming is intentionally deferred: output is checked before it is displayed.

Files: apps/api/src/{ai-provider,chat-routes,profiles}.ts and tests, schema/app integration, companion-web/app/components/Chat.tsx.

Validation: five API tests passed, including ownership, history, duplicate turns, prompts and mocked provider integration. API/web type checks passed. Live-provider evaluation is blocked by AI_PROVIDER_API_KEY and AI_CHAT_MODEL. Deployment remains inactive.

## 3 — Private photos, memory and privacy controls

Implemented authorized photo uploads (JPG/PNG/WebP, 2 MB and 20 MP limits), server-side image validation/resizing/metadata removal, owner-only image retrieval and deletion, optional persistent memories with consent timestamps/version, note viewing/editing/deletion, consent withdrawal, companion deletion, and account data export. Photos are private database blobs and are not sent to the AI model. Likeness permission is a recorded user attestation, not independently verified consent.

Files: apps/api/src/privacy-routes.ts, route integration, companion-web/app/components/CompanionTools.tsx, chat/settings integration, extended mvp.test.ts.

Validation: five tests pass with expanded assertions for memory consent, prompt retrieval, cross-user editing/reading, image decoding and rejected SVGs, export, and deletion cascades. API and web type checks pass. Deployment remains inactive. Production encryption/backups/retention and live-provider retention review remain operational requirements.

## 4 — Voice and multilingual integration

Implemented microphone permission/error handling, bounded recording with review-before-send transcription, synthetic voice selection/playback/stop, and credential-gated speech-to-text/text-to-speech adapters. English, Hindi and Kannada are saved per companion and passed to the AI and transcription providers. Preview mode includes basic Hindi/Kannada samples, not a multilingual language model. No voice cloning is exposed. Full-duplex real-time conversation and token streaming remain deferred.

Files: apps/api/src/voice-routes.ts and voice.test.ts, companion language prompt/preview handling, companion-web/app/components/Voice.tsx and Chat integration.

Validation: six tests pass (including a mocked speech adapter and disabled-provider behavior); API/web type checks pass. Live speech and multilingual quality evaluation are blocked by AI_PROVIDER_API_KEY, AI_CHAT_MODEL, AI_STT_MODEL and AI_TTS_MODEL. Browser microphone/device testing remains to be performed. Deployment remains inactive.

## 5 — Subscription scaffolding, security and Render configuration

Prepared free/premium plan metadata, inactive subscription records and visible usage settings; no payment collection or self-upgrade route is enabled. Added persistent daily quotas, per-minute request limits, production cookie/origin checks, database-aware health, anonymous-preview retirement, fail-closed moderation, browser security headers, graceful combined-service startup, isolated Render configuration and a SoulNest CI workflow. Patched the inherited PostCSS advisories using an 8.5.33 override without changing Veyra source.

Files: ai-platform/render.soulnest.yaml, scripts/start-soulnest.mjs, .env.example, workspace package/lockfile, API/web security updates, database.test.ts, documentation and .github/workflows/soulnest.yml.

Validation: seven SoulNest/API tests pass, including restart persistence and quota enforcement; five legacy Rydex security tests pass; API type check and both SoulNest/Veyra production builds pass; production dependency audit reports zero vulnerabilities. Render public-schema validation passed. An HTTP end-to-end check passed through the built site for security headers, signup, login, companion creation, Kannada preview chat, saved memory/history, export and account deletion. Browser automation could not initialize (missing kernel assets), so visual layout and device microphone interactions have not been manually verified.

Deployment: files are prepared; the user authorized planning only in Shree’s workspace. No services or billing have been activated. Live AI/speech credentials, email verification/recovery, stronger age assurance, model safety/language evaluation and production operational review remain open. Streaming and full-duplex speech are deferred. The Render plan is to be reviewed separately before application.
