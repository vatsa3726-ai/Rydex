# Mobile-first development direction

SoulNest's primary client is now `apps/soulnest-mobile`, using React Native + Expo + TypeScript + Expo Router. The browser app is retained for compatibility and does not define the product roadmap. Veyra and legacy Rydex source and deployment definitions are unchanged.

## Delivery sequence

1. Android: native onboarding, secure sign-in, multiple personalized companions and text chat against the existing PostgreSQL API.
2. Private authorized photos in an S3 bucket, explicit saved-memory controls, deletion, local generic notifications and profile settings.
3. Turn-based AI voice: record, transcribe, review, send, hear synthetic reply; English/Kannada/Hindi selection. No real-person voice-cloning feature.
4. iOS bundle/configuration, EAS preview APK and production AAB/TestFlight profiles.
5. Verified signed builds, device validation, production API/provider connections and store submissions after account/configuration requirements are met.

These are native React Native screens, not a website embedded in a WebView. Native session tokens stay in SecureStore; private conversations are retrieved from the server. Browser cookies remain supported without weakening origin/CSRF checks. Payments remain inactive.

See `apps/soulnest-mobile/README.md` for the implemented feature list, validation results and release blockers. Build configuration is not proof of a native build or publication.

The isolated Render Blueprint now deploys the API directly for native clients. The backend public base is /v2/soulnest; no browser proxy is required. No Render resources were changed or deployed.
