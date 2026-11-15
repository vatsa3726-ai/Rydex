# Architecture

## Product boundaries

SoulNest and Veyra AI are separate products with separate web experiences, branding, content policies and user-facing settings. Shared infrastructure is limited to services that can enforce tenant and brand boundaries.

## Initial service boundaries

1. Identity and sessions
2. Age assurance
3. Brand-scoped profiles and catalogues
4. Conversations and messages
5. Consent-controlled memory
6. AI provider gateway
7. Safety and moderation
8. Plans, subscriptions and entitlements
9. Administration and audit logging

## Data isolation

Every brand-owned record must carry a brand identifier. API authorization must verify both the authenticated user and the brand/resource relationship. Conversations and memories must never be loaded across brands by default.

## Subscription entitlements

- `COMPANION_PREMIUM`
- `MODEL_PREMIUM`
- `ALL_ACCESS`

The All Access entitlement grants both product entitlements. Prices and quotas must be configurable, not hard-coded.

## Payments

Implement a provider-neutral billing interface. Do not activate checkout until the selected payment processor has approved the business model in writing. Webhooks must be signature-verified and idempotent.

## Privacy and safety

- Strictly non-sexual family-role companion personas.
- Veyra AI personas must be fictional adults and experiences remain non-explicit.
- Age assurance before access to age-restricted features.
- Explicit consent before cross-brand account linking or memory sharing.
- User-accessible memory controls and account deletion workflow.
- Secrets only in deployment environment variables.
