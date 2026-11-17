# SoulNest MVP milestone log

## 1 — Accounts and companion creation

Implemented a warm responsive landing page, signup/login, private dashboard, companion creation and editing, relationship/personality/language preferences, account deletion, and disabled premium plan presentation. Account access uses scrypt password hashes, hashed session capabilities in HttpOnly SameSite cookies, origin checks, validation, and auth rate limits. All users self-confirm 18+; this is not verified age assurance. PostgreSQL tables are namespaced sn_; local development uses persistent embedded PostgreSQL (PGlite), production requires DATABASE_URL. Rydex and Veyra are unchanged.

Files: apps/api/src/{database,auth,mvp}.ts, app/server integration, companion-web/app UI and components, workspace dependencies and lockfile.

Validation: four API tests passed, API type checking passed, web TypeScript checking and production build passed. Render deployment not activated. Email verification and password recovery remain unconnected; this is a private MVP until those are implemented.

## 2 — Configurable AI chat and private history

Implemented server-owned conversation history, pagination, deletion, contextual personality prompts, duplicate-turn protection, and an OpenAI-compatible chat adapter with input/output moderation, a 30-second provider timeout and response limits. History and saved customization never become system instructions. The UI clearly identifies English sample replies when no live provider is configured. Streaming is intentionally deferred: output is checked before it is displayed.

Files: apps/api/src/{ai-provider,chat-routes,profiles}.ts and tests, schema/app integration, companion-web/app/components/Chat.tsx.

Validation: five API tests passed, including ownership, history, duplicate turns, prompts and mocked provider integration. API/web type checks passed. Live-provider evaluation is blocked by AI_PROVIDER_API_KEY and AI_CHAT_MODEL. Deployment remains inactive.
