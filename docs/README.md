# Database Schema

The schema lives in [`../api/src/db/Migration`](../api/src/db/Migration) as
numbered SQL migration files, applied in order. The first one,
`001_first_schema.sql`, must be run against your Supabase PostgreSQL database
before any of the three services (api, mobile-app, admin-app) will function
correctly.

All tables, types, functions, and views are created inside the
`"Tombola_DB"` schema (not `public`) — the migration sets
`search_path` before creating anything, and `api/src/db/client.ts` sets the
same `search_path` on its connection via the `DB_SCHEMA` env var (see
`api/.env.example`), so the two stay in sync. If you rename the schema,
update `DB_SCHEMA` to match.

## How to apply

1. Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql)
2. Paste the contents of `api/src/db/Migration/001_first_schema.sql`
3. Click **Run**
4. Apply any later-numbered migration files in the same folder, in order

All tables, views, functions, and triggers will be created.

## Schema/API reconciliation — resolved

This schema was originally authored independently of `api/src/db/queries/*`
and, at the time, differed from what that layer assumed in several places
(column names, status enums, missing tables). **That reconciliation has
since been completed** — `api/src/db/queries/*` reads the real column names
(e.g. `users.phone_number`, not an assumed `phone`), and the full ticket
purchase → payment → webhook → ticket-issuance flow has been verified
end-to-end against this actual schema and a real running database, not
just type-checked.

One item from the original mismatch list is still genuinely open:
`otp_codes` exists as a real table, but `api/src/modules/auth` tracks OTP
state in an in-memory `Map` instead — see the "Known gaps" section of
[`../SOFTWARE_REQUIREMENTS.md`](../SOFTWARE_REQUIREMENTS.md) for the current,
maintained list of gaps like this one.
