# SoulNest mobile build validation — 17 November 2026

## Verified Android APK

- Build run: https://github.com/vatsa3726-ai/ai-platform/actions/runs/44046759311
- Artifact: https://github.com/vatsa3726-ai/ai-platform/actions/runs/44046759311/artifacts/14311654580
- Source: b8a70f36066dc90743974735b39a34353801bebe (native application code introduced in 8f311dd).
- GitHub Android job: success, including assembleRelease, signature verification and artifact upload.
- Label/package: SoulNest Preview / com.hpsvinfratech.soulnest.preview.
- Version: 0.2.0, version code 1; minimum Android API 24; target API 36; compile SDK 37.
- Architectures: arm64-v8a and x86_64.
- APK size: 54,236,652 bytes.
- APK SHA-256: 31b70d795151ac48f456234cbf967af07670e5ecfb2401feee39b5c0569fb05c.
- ZIP SHA-256: 5e16b0e88e4e6945521c73ec737a388d5447fc4a3281bd5b46b780b2f6650a07.
- Signature: APK Signature Scheme v2 verified in CI and independently after downloading; one Android Debug/test signer, not a store signing identity.

The artifact is a LOCAL PREVIEW. Its embedded API is http://10.0.2.2:4000/v2/soulnest, intended to reach a local development API from an Android emulator. It is not a standalone production phone release. A deployed HTTPS API and a rebuilt configured APK/AAB are needed for public/phone distribution. Artifact retention is 14 days in GitHub; source and reproduction instructions remain in the repository.

## Other validation

- Eight API integration/security/provider tests passed.
- Two native API-transport security tests passed.
- Native and API TypeScript checks passed.
- Expo dependency compatibility and Expo Doctor 20/20 passed.
- Both Android and iOS Hermes/JavaScript bundles exported successfully.
- Both existing browser clients built successfully after shared React alignment.
- Five legacy Rydex security tests passed; Rydex CI remained green.
- Production dependency audit: zero vulnerabilities.
- Real HTTP native-account smoke passed: signup, bearer session, profile editing, Friend creation, optional memory, Kannada sample chat/history, logout/login and account deletion.
- The mobile API Render configuration passed current public-schema validation; no infrastructure was applied.

No emulator/physical-device UI, microphone, notification or photo-picker runtime test completed. The local Windows Android build was stopped when its Java SDK installer stalled on the NDK archive; the GitHub runner completed the native compilation instead.

## Not built, deployed or published

- No signed iOS IPA, Apple TestFlight build, Google Play release or App Store publication.
- Expo CLI reported Not logged in. Real Expo project/account, Apple signing/team/App Store Connect setup and confirmed store identifiers are required.
- No production API/S3/AI/speech service connection was activated. Those credentials and a reachable HTTPS backend remain prerequisites for live use. Earlier Render planning requires workspace payment information.
- Payments remain disabled. Remote push, full-duplex streaming calls, email verification/recovery, stronger age assurance, verified real-person authorization and live safety/language/device validation remain release work.

Veyra and legacy Rydex source are unchanged. Ordinary CI continues to validate the app; optional native APK builds are requested with an [apk] push commit message or Workflow Dispatch after the workflow is on the default branch.
