# YeneEta — Raffle Platform

A raffle/lottery platform for the Ethiopian market: buy tickets by phone number and SMS code, watch a provably-fair draw, claim real prizes. Monorepo containing three independent, deployable services connected only by an HTTP API contract.

| Service | What it is | Local URL |
|---|---|---|
| `api` | Hono.js REST API on the Bun runtime | http://localhost:3435 |
| `mobile-app` | SvelteKit PWA, wrapped with Capacitor for an installable Android app | http://localhost:4345 |
| `admin-app` | SvelteKit dashboard for raffle/user/payout management | http://localhost:5355 |

## Status

This project runs on **mock data for two integrations** right now, by design, not by accident:

- **OTP delivery** — `123456` works as the login code for any phone number (`DEMO_OTP_ENABLED=true`). No SMS gateway is required to test the full purchase flow.
- **Payments** — ticket purchases route through a fake in-app checkout page instead of real Chapa (`MOCK_PAYMENTS=true`). The real webhook → ticket-issuance flow still runs end-to-end; only the "charge a card" step is faked.

Both flip off with real credentials whenever you're ready — see [`deploy/COOLIFY.md`](./deploy/COOLIFY.md) § *Mock data*, or check current status live at `/integrations` in the admin dashboard (owner role only). Telebirr is schema-only — no integration code exists yet.

## Architecture

```
Tombola-app/
├── api/            → Hono.js REST API on Bun runtime
├── mobile-app/     → SvelteKit + Capacitor (installable Android PWA)
├── admin-app/      → SvelteKit web dashboard (owner/moderator)
├── deploy/         → Deployment configs — Docker/Coolify and bare-metal/systemd
└── docs/           → Database schema notes (SQL lives in api/src/db/Migration)
```

Each folder is an **independent project** with its own `package.json`, dependencies, and dev server. They share no `node_modules` and have no monorepo workspace coupling — communication is exclusively over HTTP via the API.

## Prerequisites

1. **Bun** ≥ 1.1 — [Install Bun](https://bun.sh/docs/installation)
2. **PostgreSQL** (Supabase or any Postgres instance) — [Create a Supabase project](https://supabase.com/dashboard)
3. **Database schema** — run `api/src/db/Migration/001_first_schema.sql` against your database before starting any service (creates the `Tombola_DB` schema), then any later-numbered migration in that folder, in order

## Getting started (local dev)

```bash
git clone https://github.com/MichaelETPHP/Tombola-app.git
cd Tombola-app

# Apply the schema — paste 001_first_schema.sql into your DB's SQL editor and run it

# API
cd api
cp .env.example .env        # fill in DATABASE_URL, JWT secrets — see api/README.md
bun install
bun run dev                  # → http://localhost:3435

# Mobile app (new terminal)
cd mobile-app
cp .env.example .env
bun install
bun run dev                  # → http://localhost:4345

# Admin dashboard (new terminal)
cd admin-app
cp .env.example .env
bun install
bun run dev                  # → http://localhost:5355
```

### Windows: start everything at once

`start-all.bat` (repo root) opens all three dev servers in their own terminal windows:

```bat
start-all.bat
```

## Deployment

Two independent paths — pick one, they don't mix:

- **[Docker + Coolify](./deploy/COOLIFY.md)** — the current path. Each service has a hardened, production-ready `Dockerfile` (pinned base images, non-root user, health checks); `docker-compose.yml` at the repo root wires all three together with no host ports bound, so it can't collide with other projects sharing the same VPS.
- **[Bare-metal / systemd](./deploy/DEPLOY.md)** — the original path: `bun install --production` + a systemd unit + nginx, no containers.

## Documentation

- **[Software Requirements & Business Flow](./SOFTWARE_REQUIREMENTS.md)** — raffle lifecycle, purchase flow, draw mechanism, payout/claim flow, dev workflow, and known gaps. Start here to understand *why* the code is shaped the way it is.
- [Deployment guide (Docker/Coolify)](./deploy/COOLIFY.md)
- [Deployment guide (bare-metal/systemd)](./deploy/DEPLOY.md)
- [Database schema notes](./docs/README.md)
- [API reference](./api/API.md)

## Project READMEs

- [API README](./api/README.md)
- [Mobile App README](./mobile-app/README.md)
- [Admin App README](./admin-app/README.md)

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict) |
| API framework | Hono.js |
| Frontend framework | SvelteKit 2 (Svelte 5) |
| Mobile shell | Capacitor |
| Database | PostgreSQL (Supabase) |
| DB client | postgres.js (porsager) |
| Validation | Zod |
| Auth | JWT (access + refresh token) |
| Image processing | sharp |
| Deployment | Docker, Coolify |

## License

Private — All rights reserved.
