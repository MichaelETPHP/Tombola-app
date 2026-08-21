# Tombola — Raffle Platform

A production-grade raffle/tombola platform for the Ethiopian market. Monorepo containing three independent, deployable projects connected by API contract only.

## Architecture

```
tombola-platform/
├── api/            → Hono.js REST API on Bun runtime
├── mobile-app/     → SvelteKit + Capacitor (installable iOS/Android)
├── admin-app/      → SvelteKit web dashboard (owner/admin)
└── docs/           → Database schema and documentation
```

Each folder is an **independent project** with its own `package.json`, dependencies, and dev server. They share no `node_modules` and have no monorepo workspace coupling — communication is exclusively over HTTP via the API.

## Prerequisites

1. **Bun** ≥ 1.1 — [Install Bun](https://bun.sh/docs/installation)
2. **PostgreSQL via Supabase** — [Create a project](https://supabase.com/dashboard)
3. **Database schema** — Run `docs/schema.sql` against your Supabase database before starting any service

## Getting Started

```bash
# 1. Clone the repo
git clone <repo-url> && cd tombola-platform

# 2. Run the database schema
#    Copy docs/schema.sql into Supabase SQL Editor and execute it

# 3. Start the API
cd api
cp .env.example .env        # fill in your Supabase connection string, secrets, etc.
bun install
bun run dev                  # → http://localhost:3000

# 4. Start the Mobile App (in a new terminal)
cd mobile-app
cp .env.example .env
bun install
bun run dev                  # → http://localhost:5173

# 5. Start the Admin Dashboard (in a new terminal)
cd admin-app
cp .env.example .env
bun install
bun run dev                  # → http://localhost:5174
```

## Project READMEs

- [API README](./api/README.md)
- [Mobile App README](./mobile-app/README.md)
- [Admin App README](./admin-app/README.md)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| API Framework | Hono.js |
| Frontend Framework | SvelteKit 2 (Svelte 5) |
| Mobile Shell | Capacitor |
| Database | PostgreSQL (Supabase) |
| DB Client | postgres.js (porsager) |
| Validation | Zod |
| Auth | JWT (access + refresh token) |
| Image Processing | sharp |

## License

Private — All rights reserved.
