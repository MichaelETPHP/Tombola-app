# Tombola API

REST API serving both the mobile app and admin dashboard. Built with Hono.js on Bun runtime.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- PostgreSQL database (via Supabase)
- Database schema applied (see [`src/db/Migration`](./src/db/Migration))

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `DB_SCHEMA` | ❌ | Schema all tables/types/views live in (default: `Tombola_DB`) — must match the schema created by `src/db/Migration/001_first_schema.sql` |
| `JWT_ACCESS_SECRET` | ✅ | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | Secret for signing refresh tokens (min 32 chars) |
| `SMS_API_URL` | ❌ | SMS gateway URL (dev mode logs OTP to console) |
| `SMS_API_KEY` | ❌ | SMS gateway API key |
| `CHAPA_SECRET_KEY` | ❌ | Chapa payment gateway secret |
| `CHAPA_WEBHOOK_SECRET` | ❌ | Chapa webhook verification secret |
| `CORS_ORIGINS` | ❌ | Comma-separated allowed origins (default: localhost) |
| `PORT` | ❌ | Server port (default: 3435) |

## Getting Started

```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun run dev

# Type check
bun run check

# Start production server
bun run start
```

## API Overview

### Public Endpoints
- `GET /health` — Health check
- `GET /raffles` — List raffles
- `GET /raffles/:id` — Get raffle detail
- `GET /draws/:token` — Trigger link landing (executes draw)
- `POST /auth/otp/request` — Request OTP
- `POST /auth/otp/verify` — Verify OTP, receive JWT
- `POST /auth/refresh` — Refresh access token

### Authenticated User Endpoints
- `GET /users/me` — Get profile
- `PATCH /users/me` — Update profile
- `POST /raffles/:id/tickets` — Purchase tickets
- `GET /tickets` — List user's tickets
- `GET /payouts/mine` — List the user's own win/claim history
- `POST /payouts/:id/claim` — Submit prize claim

### Admin Endpoints (role-gated)
- `GET /admin/dashboard` — Dashboard stats
- `POST /admin/raffles` — Create raffle
- `GET /admin/users` — List users
- `PATCH /admin/users/:id/suspend` — Suspend/unsuspend user
- `GET /admin/payouts` — List payouts
- `PATCH /admin/payouts/:id` — Update payout status

### Webhooks
- `POST /payments/webhook/chapa` — Chapa payment callback
