# SoulNest 0.3 mobile build validation — 20 November 2026

## Verified Android preview APK

- [Build run 14](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44681783030): validation and native Android compilation both succeeded.
- [Artifact 14605770021](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44681783030/artifacts/14605770021), named `soulnest-android-local-preview`. GitHub retention expires 4 December 2026; the downloaded APK is also saved in this task's outputs.
- Source commit: `6d13edb78ecbc94814ef9b3b3bbe94d78e58f213`, on `codex/soulnest-completion`. Later documentation commits do not change the compiled source.
- Gradle `assembleRelease` succeeded in 13 minutes 10 seconds, followed by Android build-tools 37.0.0 `apksigner` verification and artifact upload.
- Package: `com.hpsvinfratech.soulnest.preview`. Preview label configured as SoulNest Preview.
- Compiled manifest: version `0.3.0`, version code `2`, minimum Android API `24`, target API `36`, compile SDK `37`, backups disabled. Local-preview HTTP is explicitly enabled.
- Compiled native architectures: `arm64-v8a` and `x86_64`.
- APK size: `54,264,484` bytes.
- APK SHA-256: `01be3639b92d8b97ef9cc4a5b77acc6e1754893cd594348cb0a1270f814b5a56`.
- Artifact ZIP SHA-256: `97751bc90eef05c193abe46fb613f468db5c5cc9b0a931f90de401c0b1540331`. Downloaded ZIP/APK hashes match the build output.
- APK Signature Scheme v2 verified in CI and independently on the downloaded file using Android's official `apksig` 9.5.1 library. One Android Debug/test signer; certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. This is not a store signing identity. A separate local cryptographic check also verified the signed data, matching certificate key and protected-content digest.

This is a **LOCAL PREVIEW**, not a standalone public phone release. The embedded API `http://10.0.2.2:4000/v2/soulnest` was confirmed inside the compiled bundle. It reaches the development computer from an Android emulator. The preview's connection screen can select a reachable trusted LAN or HTTPS server. A physical phone must reach that server on its network; `localhost` on a phone refers to the phone. Use test accounts on a trusted network for unencrypted local HTTP. Store builds require a verified HTTPS API and do not expose the connection override.

No emulator/physical-device UI, microphone, notification, native share-sheet or photo-picker runtime test completed. Compilation, signatures and bundle exports do not replace device testing.

## Application validation

- [SoulNest PR validation](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44681880339): passed 16 API integration/security/provider tests, two native transport tests, API/native TypeScript checks, Expo compatibility, Android/iOS Hermes exports, both browser production builds, browser account/chat/privacy workflow and production dependency audit (zero reported vulnerabilities).
- Expo Doctor passed 20/20 locally. Five legacy Rydex tests passed locally; [Rydex CI](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44681880396) and [Veyra regression CI](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44681880416) passed.
- Browser tests used a fresh isolated database, a synthetic mailbox and sample replies. They covered email verification/recovery, password change and session revocation, Friend creation, Kannada sample chat/history, optional memory, reporting without an excerpt by default, account export and 390px layout without horizontal overflow or runtime errors.
- Actual local HTTP native-account flow passed signup, bearer session, profile editing, Friend creation, optional memory, Kannada sample chat/history, logout/login and account deletion.
- Refreshed local SoulNest website/API and Veyra preview returned HTTP 200. Browser screenshots show the browser client, not native device screenshots.
- Only namespaced SoulNest schema is migrated. Veyra-specific and legacy source files are unchanged from the previous Veyra commit.

## External setup and release status

- The user confirmed Expo/EAS and Apple Developer accounts are not set up. No signed iOS IPA, EAS build, Apple TestFlight upload, Google Play release or App Store publication exists for this release. iOS Hermes export passed; that is not an installable iPhone build. Windows cannot create a signed iOS archive without an appropriate macOS/Xcode or cloud signing environment.
- Render configuration passed public-schema validation. Planning in the user-selected Shree workspace reported `need_payment_info` for the proposed service and database. The proposal was not applied; no SoulNest service/database, public deployment or billing activation occurred.
- Real email delivery, AI chat/speech and private object storage credentials remain unconnected. Their adapters and failure handling are implemented and tested with fixtures; live behaviour is not verified. Local sample chat/private development storage remain available.
- Final domain and support email are deferred at the user's request. Real store accounts/identifiers/signing, provider setup, live safety/language evaluations, device tests and production privacy/operations review remain prerequisites for launch.
- Email verification/recovery are implemented in 0.3 and require a configured authorized mail sender. Stronger age assurance and independently verified real-person authorization remain launch work. No real-person voice cloning, full-duplex streaming calls or remote push is implemented. Voice uses turn-based synthetic speech; reminders are optional local notifications.
- Payment collection remains disabled. Free/premium limits and expiring evaluation entitlements are implemented; no checkout or purchase is active.

The historical 0.2 preview remains reproducible from [run 44046759311](https://github.com/vatsa3726-ai/ai-platform/actions/runs/44046759311), source `b8a70f36066dc90743974735b39a34353801bebe`. The current verified preview is 0.3.0 above. Native builds are requested by a push commit containing `[apk]`, or Workflow Dispatch once the workflow is on the default branch. Ordinary CI validates both native bundles and browser/backend regressions without rebuilding the APK.
