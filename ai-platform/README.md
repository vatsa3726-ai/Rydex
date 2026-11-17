# AI Platform

SoulNest and Veyra AI are developed under HPSV Infra Tech LLP inside this directory. Legacy Rydex at the repository root is preserved.

- `apps/companion-web`: SoulNest account-owned companion MVP.
- `apps/models-web`: Veyra AI scaffold, unchanged by the SoulNest MVP.
- `apps/api`: shared API, including isolated SoulNest account/data routes.

SoulNest includes registration/login, companion customization, private history, authorized photos, optional saved memories, configurable AI/speech providers, usage limits and privacy controls. Without provider credentials, replies are explicitly labelled samples. Live payments are disabled.

See [setup and release notes](docs/soulnest-mvp.md) and [milestone log](docs/mvp-milestones.md). Deployment is configured separately in `render.soulnest.yaml`; do not replace the repository-root Rydex Blueprint.
