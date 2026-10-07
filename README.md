# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.


## Render deployment

The repository includes `render.yaml` for a single-service deployment: the Node API serves the built React app and connects to managed Render Postgres. Render Blueprints support wiring `DATABASE_URL` directly from a Postgres resource and prompting for secret values without committing them.

For testing, Render offers free web services and Postgres, but the free Postgres database expires after 30 days and free services have important limitations, so use paid resources before a real launch.

After creating the Blueprint:
1. Enter Razorpay test credentials.
2. Enter Google Maps browser/server keys.
3. Enter the Razorpay webhook secret.
4. Set `FRONTEND_ORIGIN` to the production origin if cross-origin requests are needed.
5. Configure the Razorpay webhook URL as `https://<your-domain>/api/payments/webhook`.
6. Test OTP, search, booking, payment, webhook reconciliation, driver assignment and completion in test mode.


## Production security requirements

Before deploying production, configure:
- `FRONTEND_ORIGIN` with the exact production origin.
- `PROVIDER_CREDENTIAL_KEY` as a base64-encoded 32-byte random key.
- `ADMIN_TOKEN` and `PROVIDER_API_TOKEN` as strong secrets.
- `OTP_DEMO_MODE=false`.

Generate a provider credential key with Node:
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Rydex production uses the redirect-first model: Rydex compares authorized provider quotes and hands the user to the selected provider. Direct Rydex booking, Rydex payment, and Rydex driver operations remain development-only.


Security hardening PR #44 includes automated validation before merge.
