# Rydex API

The API is the booking and payment orchestration layer for Rydex.

## Run locally

From the project root:

```bash
npm install
npm run server
```

The API runs at `http://localhost:4000`.

### Endpoints

- `GET /api/health`
- `POST /api/rides/search`
- `POST /api/bookings`
- `GET /api/bookings/:id`

The current provider adapter returns demo quotes. Real mobility operators must be integrated through authorized APIs/partnerships.

Booking storage is intentionally in-memory in this first backend milestone. The Prisma schema defines the production PostgreSQL model that we will wire in next.
