# AI Platform

SoulNest is now a **mobile-app-first** product under HPSV Infra Tech LLP. Legacy Rydex at the repository root and Veyra AI source remain preserved.

- `apps/soulnest-mobile`: primary Android/iOS app built with React Native, Expo and TypeScript.
- `apps/api`: shared PostgreSQL-backed API, native secure sessions, private S3 photo storage, AI/speech adapters and privacy controls.
- `apps/companion-web`: existing browser client, retained for compatibility and development.
- `apps/models-web`: Veyra AI scaffold, unchanged.

Start with the [mobile setup and release checklist](apps/soulnest-mobile/README.md). The website is no longer the primary product. Store builds and distribution are separate steps and must not be described as published until verified.

Without provider credentials, replies are clearly labelled samples. Payments remain disabled. The isolated backend deployment configuration is in `render.soulnest.yaml`; do not replace the repository-root Rydex Blueprint.
