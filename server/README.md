# Rydex API

Rydex is a mobility comparison and booking platform. The API handles route estimation, fare calculation, OTP authentication, bookings, Razorpay payments, provider dispatch, driver tracking, partner earnings, and operations reporting.

## Run locally

```bash
npm install
npm run server
```

The API runs at `http://localhost:4000`.

## Production environment

Required/important server secrets:

- `DATABASE_URL` — PostgreSQL
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — Razorpay credentials
- `RAZORPAY_WEBHOOK_SECRET` — webhook signing secret
- `GOOGLE_MAPS_SERVER_API_KEY` — server-side Routes API key
- `FRONTEND_ORIGIN` — comma-separated allowed frontend origins
- `ADMIN_TOKEN` — operations dashboard token
- `PROVIDER_API_TOKEN` — optional provider API protection token

Browser configuration:

- `VITE_API_URL`
- `VITE_GOOGLE_MAPS_API_KEY`

Set `OTP_DEMO_MODE=false` in production and connect an authorized SMS/WhatsApp OTP provider before launch.

## Core endpoints

- `GET /api/health`
- `POST /api/rides/search`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `GET /api/auth/me`
- `POST /api/bookings`
- `GET /api/bookings`
- `GET /api/bookings/:id`
- `POST /api/bookings/:id/cancel`
- `GET /api/bookings/:id/tracking`
- `POST /api/payments/order`
- `POST /api/payments/verify`
- `POST /api/payments/webhook`
- `GET /api/providers/earnings`
- `GET /api/admin/overview`

Provider driver endpoints cover registration, availability, dispatch, ride status and GPS location.

## Payments

The server stores Razorpay order/payment identifiers in PostgreSQL and verifies checkout signatures server-side. The webhook endpoint provides asynchronous reconciliation and must be configured with an HTTPS URL and a private webhook secret.

## Provider integrations

The current provider adapter is a demo adapter. Real mobility operators must be integrated through authorized APIs or commercial partnerships. Do not scrape or reverse-engineer private endpoints.

## Deployment checklist

1. Create PostgreSQL and run `npx prisma generate` and the appropriate production migration.
2. Configure all server secrets in the hosting provider's secret manager.
3. Restrict the Google browser key by production domain and keep the server Maps key private.
4. Configure Razorpay webhook signing secret and webhook URL.
5. Disable demo OTP mode.
6. Configure an authorized OTP provider.
7. Set a strong admin token and provider token.
8. Enable HTTPS.
9. Test payment success, failure, cancellation, webhook reconciliation and driver lifecycle in Razorpay test mode before live mode.
10. Complete legal, tax, payment-aggregation, KYC and provider-contract review before accepting real customer funds.

