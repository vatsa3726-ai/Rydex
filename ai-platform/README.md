# AI Platform

A shared platform powering two distinct products under HPSV Infra Tech LLP:

- **SoulNest** — AI companions, mentors and supportive fictional personas.
- **Veyra AI** — fictional adult AI models with age-gated, non-explicit experiences.

## Project isolation

This application is being developed in the `ai-platform/` directory. The existing Rydex application and all of its files remain untouched.

## Planned architecture

- `apps/soulnest-web` — SoulNest experience
- `apps/veyra-web` — Veyra AI experience
- `apps/api` — shared API
- `apps/admin` — operations and moderation console
- `packages/database` — Prisma schema and migrations
- `packages/ai-engine` — replaceable model-provider gateway
- `packages/auth` — identity and session utilities
- `packages/billing` — plans, subscriptions and entitlements
- `packages/safety` — age assurance, moderation and policy enforcement
- `docs` — architecture and implementation decisions

## Safety and privacy

- Age assurance is required before access to age-restricted experiences.
- Veyra AI personas are fictional adults; content is non-explicit.
- Family-role companions on SoulNest remain strictly non-sexual.
- Brand data, conversations and memories are isolated.
- Cross-brand account linking and memory sharing require explicit consent.
- Payment checkout remains disabled until the payment provider approves both business verticals.

## Status

Initial project foundation. No production credentials or payment secrets belong in source control.
