# Tombola Admin Dashboard

Owner/moderator web dashboard: create and manage raffles, review payout
claims, manage users, and (once implemented) browse the audit log. Talks to
the `api` project over HTTP only. Web-only — no Capacitor.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- The `api` project running locally (or a deployed URL)

## Environment Variables

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Base URL of the `api` project |

## Getting Started

```bash
# Install dependencies
bun install

# Start the dev server
bun run dev                  # → http://localhost:5174

# Type check
bun run check

# Build for production (adapter-node)
bun run build

# Run the built server
bun run start
```

## Structure

- `src/routes/login` — admin sign-in
- `src/routes/(dashboard)` — sidebar-wrapped authenticated screens: overview, raffles, payouts, users, audit log
- `src/lib/components` — `Sidebar`, `DataTable` (generic sortable table), `RaffleForm`, `StatusBadge`
- `src/lib/theme/tokens.ts` — professional slate/indigo palette, distinct from the mobile app's consumer theme
- `src/lib/schemas` — Zod schemas kept in sync with the API's route schemas (see comments where they mirror `api/src/modules/*`)

## Known gaps (frontend is ready, API isn't yet)

These screens are fully wired up and will work as soon as the corresponding
API endpoint exists — until then they show a clear empty/error state instead
of pretending to work:

- **Admin login** (`POST /admin/auth/login`) — there's no `admins` table or
  password auth in the API yet, only phone/OTP auth for participants. Add it
  once `docs/schema.sql` defines admin accounts.
- **Audit log** (`GET /admin/audit-log`) — no `audit_log` table/module in
  the API yet.
- **Raffle prize photo upload** — the API's `createRaffleSchema` has no
  image field and there's no upload route, even though `api/src/lib/image.ts`
  (the sharp wrapper) exists. `RaffleForm` intentionally omits the field
  until that contract exists.
- **Raffle manual controls** (lock/extend/cancel) — only the background
  jobs in `api/src/jobs` transition raffle state today; there's no admin
  mutation endpoint for it yet.

Everything else (dashboard stats, raffle list/detail/create, payout queue
and review, user list and suspend) calls real, already-implemented API
routes.
