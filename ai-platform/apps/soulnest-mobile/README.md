# SoulNest — Android/iOS native MVP

Current release: **0.3.0**. See [the release completion report](../../docs/soulnest-release-0.3.md) for new features, exact verification and remaining external setup.

SoulNest is now mobile-first. This is an actual React Native + Expo SDK 58 + TypeScript app using Expo Router, not a WebView wrapper. HPSV Infra Tech LLP is the parent company. The existing website is a secondary compatible client; Veyra and legacy Rydex source remain unchanged.

## Implemented

- Native onboarding, 18+ self-attestation, signup/login, personal profile editing and secure session restoration.
- Companion gallery and four-step creation/editing wizard: Dad, Mom, Sister, Brother, Wife, Husband, Boyfriend, Girlfriend, Bestie, Friend, Mentor and Custom.
- Personality, language, speaking style, instructions, interests, phrases and optional authorized private photo.
- Account-owned text chat, recent context, pagination, saved history, retry/deduplication and clear history.
- English, Kannada and Hindi companion language preferences. Live multilingual quality still needs evaluation with a configured model.
- Explicit long-term memory opt-in, view/edit/forget, withdrawal and companion/account deletion.
- Turn-based AI voice screen: microphone permission, capped recording, speech transcription, transcript review, synthetic voice selection, spoken replies and playback cancellation. Capture/playback stop on background/unmount. It is not a full-duplex telephone call; no voice cloning is exposed.
- Optional generic local daily reminder, enabled only by user choice. No private companion/message text appears in the notification. Remote push is not implemented.
- Configurable free/premium limits with expiring operator-assigned evaluation access. No purchases or payment collection.
- Email verification/recovery, password changes, sign-out on every device, private report submissions, and export through the native share sheet.
- A connection screen in local-preview builds for a trusted LAN or HTTPS backend. Server changes clear the device session; store builds have a fixed HTTPS endpoint.

Every companion is clearly disclosed as fictional AI. Family/mentor/custom styles remain platonic and all styles remain non-explicit. A name or photo never makes the simulation the actual person. Email verification and password recovery are implemented and require configured delivery. This remains a private MVP until live providers, age-assurance/launch requirements and safety/device/language evaluations are verified.

## Local development

Use Node 24. From `ai-platform/`, run `npm ci`. Start the API with `npm run dev -w @aiplatform/api`, then the app with `npm start -w @aiplatform/soulnest-mobile`. Expo Go can exercise supported modules; a native development build is needed to validate full platform behavior.

The Android emulator API URL defaults to `http://10.0.2.2:4000/v2/soulnest` in development. iOS Simulator defaults to `http://localhost:4000/v2/soulnest`. For a physical phone, set `EXPO_PUBLIC_API_URL` to your reachable development-machine LAN URL, and explicitly bind the development API appropriately. Release/store builds require an HTTPS API URL. Never use `localhost` as the address of a remote server from a phone.

Public configuration goes in an ignored `.env.local` or the EAS environment. Do not put database, object-storage, AI, signing, or Apple credentials in EXPO_PUBLIC_* variables: those values are readable in the bundle. This app deliberately does not persist conversation transcripts for offline access.

## Shared API and PostgreSQL

The app calls the existing `/v2/soulnest` routes. `/auth/native/register` and `/auth/native/login` return an opaque seven-day bearer token without browser cookies. The token is kept in Expo SecureStore (Android Keystore/iOS Keychain); the server stores only its hash. Explicit bearer credentials never fall back to cookies. Browser requests retain origin/JSON/CSRF checks; native entry points reject browser Origin headers. Logout revokes the current token; account deletion revokes all sessions. Local-only logout after network failure cannot revoke an unreachable server session; the seven-day expiry still applies.

Production requires DATABASE_URL; local development uses durable embedded PostgreSQL. Only namespaced sn_ tables are migrated. Native and browser users share the same owner-checked account data. Usage limits are database-enforced; per-minute limits are process-local. Do not expose a private MVP publicly before enrollment, verification/recovery and distributed abuse protection are ready.

## Private object photos

Set these variables on the API, never in the app:

- PHOTO_STORAGE=s3
- OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_REGION
- OBJECT_STORAGE_ACCESS_KEY / OBJECT_STORAGE_SECRET_KEY, or an appropriate server-side IAM role
- OBJECT_STORAGE_ENDPOINT only if using a compatible endpoint

The implementation requires a bucket that supports S3 GetPublicAccessBlock and has all four public-access-block flags enabled. A provider without that verification API fails closed. The server re-encodes JPG/PNG/WebP into a metadata-free 512px JPEG, uses encrypted private object writes, stores only the object key/permission metadata in PostgreSQL, and proxies reads after owner authentication. The app never receives object-store credentials or public object URLs. Photos are not sent to the AI provider. Authorization is a timestamped user attestation, not independent verification of a real person's consent.

Local development may use private database blobs as a fallback. Production new uploads fail if object storage is not configured; existing database-backed photos remain readable. The additive migration preserves existing photos.

Photo replacement/deletion and account/companion deletion enqueue durable object cleanup. A periodic worker in the API deletes unreferenced objects after a ten-minute grace period, also covering interrupted uploads. Failed storage operations retry later. Database ownership references disappear immediately; provider outages, backups and retention policies can delay physical object deletion. Monitor sn_object_deletions before public launch.

## AI and voice

The existing API adapter uses server-only AI_PROVIDER=openai, AI_PROVIDER_API_KEY and AI_CHAT_MODEL. Voice also requires AI_STT_MODEL and AI_TTS_MODEL. Without credentials, text replies are explicitly labelled samples and voice is disabled. Voice recordings are temporary and sent only for chosen transcription. Only built-in synthetic voices are supported. Streaming/full-duplex speech, external voice authorization verification and custom cloning are not implemented.

## Android packaging

`eas.json` includes development, preview APK, iOS simulator and production AAB/iOS profiles. First authenticate with `npx eas-cli login`, link the real project with `npx eas-cli init`, and configure its EAS_PROJECT_ID and EXPO_PUBLIC_API_URL. Do not invent the project UUID. Then use `npx eas-cli build --platform android --profile preview` for an installable APK, or `--profile production` for a Play AAB. Store identifiers in app.config.ts are provisional and must be confirmed against the organization’s registered identities before submission.

A separate LOCAL PREVIEW variant is available for emulator testing: set EXPO_PUBLIC_LOCAL_PREVIEW=1 and EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/v2/soulnest, run `npx expo prebuild --platform android --no-install`, then compile the generated project with the Android SDK/Java/Gradle toolchain. This uses the `.preview` package suffix and explicitly allows local HTTP; it is not a production-store build. The generated android/ios folders and signing files are excluded from Git. Never distribute a local preview as the public app.

Native APK compilation is separate from JavaScript bundle export. See the release-validation report for the observed result; configuration and a passing bundle export do not prove that an installable binary exists.

## iOS / TestFlight

The iOS bundle and native permission configuration are implemented. A signed iOS build requires a real Expo project, Apple Developer membership/team, registered bundle identifier, signing credentials and an App Store Connect app. Build with `npx eas-cli build --platform ios --profile production`, then submit a verified build with `npx eas-cli submit --platform ios --profile production`. Do not submit or publish until the organization confirms credentials, app metadata, privacy declarations, age rating and pricing. Windows cannot locally produce a signed iOS archive without a macOS/Xcode build host. No iOS/TestFlight deployment is claimed.

## Checks

From ai-platform/:

- npm test -w @aiplatform/api
- npm run typecheck -w @aiplatform/api
- npm test -w @aiplatform/soulnest-mobile
- npm run typecheck -w @aiplatform/soulnest-mobile
- npm run export:android -w @aiplatform/soulnest-mobile
- npm run export:ios -w @aiplatform/soulnest-mobile
- npm run build -w @aiplatform/companion-web
- npm run build -w @aiplatform/models-web
- npm audit --omit=dev

In this app directory, also run `npx expo install --check` and `npx expo-doctor`. The workflow includes native bundle/type checks and backend/browser regressions. Shared React/React DOM are pinned to Expo’s renderer version to avoid duplicate native React instances; Veyra source is untouched. The Expo fingerprint build-tool dependency is patched via a scoped minimatch override.

## Verified status and remaining work

Sixteen backend tests and two mobile transport tests pass, native/API type checks pass, Expo Doctor passes 20/20 checks, both Android and iOS JavaScript bundles export, both browser clients build, and the production dependency audit reports zero vulnerabilities. The production-browser walkthrough also passes verification, account recovery, private chat/history, consent-based memory/reporting and export. These checks do not replace device/microphone/photo-picker testing.

The user confirmed Expo/EAS and Apple Developer accounts are not set up. No EAS cloud build, project linking, signed store build, TestFlight upload or store publication has occurred. The backend is not publicly deployed; the current Render proposal requires workspace billing information and has not been applied. Live email, AI/speech and S3 credentials are not connected. See [mobile build validation](../../docs/mobile-build-validation.md) for the exact verified Android preview build/version/checksum. Local Windows compilation was stopped after the SDK installer stalled; no device runtime test completed. No payments are enabled.

Official references: https://docs.expo.dev/router/installation/ ; https://docs.expo.dev/versions/latest/sdk/securestore/ ; https://docs.expo.dev/versions/latest/sdk/audio/ ; https://docs.expo.dev/build-reference/apk/ ; https://docs.expo.dev/build/setup/

The Render configuration builds and starts the website plus loopback API, with /api/soulnest/health as its health check. Both /api/soulnest and the compatible /v2/soulnest paths proxy to the same backend. Use its HTTPS origin plus /v2/soulnest as EXPO_PUBLIC_API_URL. The browser client can be deployed separately if needed; no services are deployed by these files.

GitHub Actions can also compile and signature-check a LOCAL PREVIEW APK without EAS credentials. A push whose commit message includes [apk] requests that build. Workflow Dispatch is available after the workflow is on the repository default branch. The uploaded artifact is named soulnest-android-local-preview. Ordinary pushes still validate both native bundles, tests and browser regressions; they do not repeatedly build APKs.

