# Tombola — Software Requirements & Business Flow Document

Status: living document, reflects the system as of 2026-08-28. Update this
alongside code changes that affect business rules, the raffle lifecycle, or
the development workflow — an out-of-date requirements doc is worse than
none, because it gets trusted.

## 1. What this is

Tombola is a raffle/tombola platform for the Ethiopian market: users buy
numbered tickets into time-boxed raffles for real prizes (phones, cars,
electronics, gold, appliances), a winner is drawn using a provably-fair
mechanism, and the winner claims their prize through a KYC-style verification
and delivery flow. Ticket purchases are paid per-ticket via Chapa (Ethiopian
payment gateway), with Telebirr planned but not yet integrated.

Three independent, deployable projects make up the system, coupled only by
HTTP:

```
api/            Hono.js REST API (Bun runtime) — the single source of truth
mobile-app/     SvelteKit + Capacitor — the end-user app (this is where most
                of the work described in this document has happened)
admin-app/      SvelteKit web dashboard — raffle/user/payout management
```

See the root `README.md` for the tech stack table and local setup steps;
this document covers the *business* and *development* flow those pieces
serve, and the state of the project doing it.

## 2. Business flow

### 2.1 Raffle lifecycle

```
draft → open → locked → awaiting_trigger → drawing → completed
                                                    ↘ cancelled (any state, admin action)
```

| Status | Meaning |
|---|---|
| `draft` | Created by an admin, not visible to users yet. |
| `open` | Accepting ticket purchases. |
| `locked` | Ticket cap reached (or deadline hit) — no more purchases; awaiting a draw trigger. |
| `awaiting_trigger` | A "pull the lever" link has been sent to a randomly selected participant; the raffle waits for that click. |
| `drawing` | Transient — the draw is being executed. |
| `completed` | Winner determined, `draw_results` row written. |
| `cancelled` | Pulled by an admin before completion, at any point. |

If a raffle doesn't reach its ticket cap by `deadline_at`, admins can extend
the deadline (logged in `raffle_extensions`, an audit trail — not a mutable
counter) rather than being forced to either cancel it or draw from an
under-filled pool.

### 2.2 Ticket purchase flow (mobile app)

This is the flow this session's work has been built around, and the one
most thoroughly tested end-to-end.

1. **Browsing requires no account.** Home, raffle list, and raffle detail
   are all guest-accessible. Auth is deferred to the moment it's actually
   needed.
2. User picks a quantity on the raffle detail screen (capped at
   `raffle.maxTicketsPerUser`, enforced both client-side and — see below —
   at the database level).
3. Tapping **Buy**:
   - If the user isn't authenticated, their intended `{raffleId, quantity}`
     is stashed (`sessionStorage`), and they're sent to `/login` with a
     `returnTo` back to this exact raffle. Phone number → OTP → verified →
     they land back here with quantity restored.
   - Once authenticated, `POST /raffles/:id/tickets` creates a **pending**
     payment record and returns a Chapa checkout URL. **No tickets exist
     yet at this point.**
4. Checkout opens — a real Chapa hosted page in production, or (with
   `MOCK_PAYMENTS=true`) a clearly-labeled fake gateway page in the mobile
   app itself, for local testing without live merchant credentials.
5. On successful payment, Chapa calls the webhook
   (`POST /payments/webhook/chapa`) server-to-server. **This is the only
   place tickets are actually created** (`processPaymentSuccess`) —
   idempotent, so a duplicate webhook delivery is a safe no-op.
6. The user's browser is separately polling `GET /payments/:id`
   (2s interval, 90s timeout) on a status page, which shows a spinner until
   the webhook lands, then a success/failure state and a "Tickets
   purchased!" banner.

**Business rules enforced here:**
- Price = `raffle.ticketPrice × quantity`.
- A user cannot exceed `raffle.maxTicketsPerUser` tickets *in that raffle*
  — this is a per-raffle cap set by the admin when creating it (seed data
  ranges from 3 to 10 depending on the raffle), not a single global cap
  across all raffles.
- Tickets are only ever issued against a `completed` payment — a failed or
  abandoned checkout leaves no trace in `tickets`.

### 2.3 Draw mechanism — provably fair

Not yet exposed in the mobile app (this is admin/system-side); documented
here because the schema and product mechanic are worth understanding before
building UI for it.

1. When a raffle locks, the system randomly selects one participant and
   sends them a "pull the lever" link (`draw_triggers`). This is a
   deliberate product choice — a real person triggers the draw rather than
   a cron job, adding both a theatrical moment and an extra entropy source
   (the click timestamp becomes part of the seed).
2. If that link expires unclicked, a new trigger is generated for a
   different participant (`attempt_number` increments) — the raffle is
   never permanently stuck on one unresponsive person. Only one trigger can
   be `pending` per raffle at a time (enforced by a partial unique index).
3. The draw itself is a commit-reveal scheme:
   `server_seed_hash` is published *before* the raffle even opens (the
   commitment). The real `server_seed` is only revealed after the draw.
   `final_seed_hash = sha256(server_seed || client_seed)`, where
   `client_seed` comes from the trigger click. Anyone can verify after the
   fact that the draw wasn't rigged, without trusting the platform.

### 2.4 Payout & claim flow

Read-only in the mobile app today (the Wins page). The schema supports a
full claim workflow:

`pending_claim → id_submitted → verified → fulfilled` (or `rejected` /
`expired` if the claim window passes).

- `claim_deadline` — winner forfeits if they don't claim in time.
- ID document upload + verification before a prize is released.
- `delivery_method` (pickup or delivery) with a delivery address.
- Ethiopia-specific tax withholding baked into the schema:
  `tax_rate` defaults to 15%, and `net_value` is a CHECK-constrained
  computed value (`gross_prize_value - tax_withheld`) — the database
  itself refuses to store an inconsistent payout record.

### 2.5 Identity

- **End users**: phone number + OTP only. No passwords, no email. A user is
  auto-created on first successful OTP verification
  (`isNewUser` in the verify response).
- **Admins**: a separate `admin_users` table, phone number + password,
  `owner` or `moderator` role. Not the same auth flow or token type as
  end users.

## 3. Non-functional requirements

- **Guest-first**: no feature that's just "looking around" should require
  an account. Auth is asked for at the point of commitment (buying), not
  up front.
- **Native shell, web-deployed content**: the Android app (Capacitor) loads
  a live URL rather than bundling content — shipping a content update is a
  web deploy, not an app-store resubmission. Only icon/splash/permissions/
  native-plugin changes require touching the native project again. See
  `deploy/DEPLOY.md`.
- **PWA-installable**: manifest, service worker (`registerType: 'autoUpdate'`),
  offline fallback for the bundled shell.
- **Design**: iOS-inspired, "simple, elegant" per explicit direction —
  Plus Jakarta Sans (SF-Pro-alike, legally embeddable) for UI text, Fraunces
  for display/headline moments, custom cubic-bezier easing (not default CSS
  easings) throughout, filled (not bordered) form inputs, circular progress
  rings for stat visualization, a raffle-ticket perforation motif as the
  app's own visual signature.
- **Motion discipline**: UI feedback animations stay under ~300ms with
  proper easing; rare/first-time moments (login success, purchase
  confirmation) get a bit more room (banners, staggered entrances).
- **Security baseline**: short-lived access tokens (15m, held in memory
  only — never persisted), long-lived refresh tokens (30d) in an httpOnly
  cookie scoped to `/auth/refresh`, OTP request rate-limited (5 per 5 min
  per IP), CORS allowlist rather than wildcard origin.

## 4. Development flow

### 4.1 Local setup

See root `README.md` for the full walkthrough. Summary:

```bash
cd api && cp .env.example .env && bun install && bun run dev       # :3435
cd mobile-app && cp .env.example .env && bun install && bun run dev # :4345
cd admin-app && cp .env.example .env && bun install && bun run dev  # :5355
```

Windows: `start-all.bat` at the repo root starts all three.

### 4.2 Testing payments without real Chapa credentials

Set `MOCK_PAYMENTS=true` in `api/.env`. `chapaInitialize()` then skips the
real Chapa API and points checkout at `/mock-checkout` in the mobile app —
a page deliberately styled *unlike* the real app (plain gray, fake
`checkout.mock-gateway.dev` URL, orange "DEV ONLY" badge) so it's never
confusable with production. It still calls the real webhook, so ticket
issuance and payment-status polling are exercised for real — only the
"actually charge a card" step is faked. **Must be `false` (or unset) with a
real `CHAPA_SECRET_KEY` before shipping.**

### 4.3 Testing OTP without a real SMS provider

If `SMS_API_URL`/`SMS_API_KEY` are unset in `api/.env`, the API logs OTP
codes to its own console (`[SMS DEV MODE] ...`) instead of sending them.
Real end-to-end testing this session has driven the actual OTP boxes in the
UI using codes read from that log — not shortcuts.

### 4.4 Native build

```bash
cd mobile-app
bun run build
bunx cap sync android
cd android && ./gradlew.bat assembleDebug
```

Produces `android/app/build/outputs/apk/debug/app-debug.apk`. Full
production deployment steps (nginx configs, systemd unit, env vars to flip)
are in `deploy/DEPLOY.md`.

## 5. Database schema

Full schema: `api/src/db/Migration/001_first_schema.sql`. Seed data (6
sample raffles, 100 sample users, realistic ticket distributions):
`002_seed_data.sql`.

| Table | Purpose |
|---|---|
| `users` | End users, phone-based identity. |
| `admin_users` | Platform staff (owner/moderator), phone + password. |
| `otp_codes` | Schema exists for hashed OTPs with purpose/attempts — **not currently used**; the API tracks OTP state in an in-memory `Map` instead (see §6). |
| `raffles` | Core raffle definition — prize, pricing, cap, deadline, status. |
| `raffle_extensions` | Audit trail of deadline pushes. |
| `payments` | One row per checkout attempt; `ticket_count` × `amount`; pending until the webhook confirms. |
| `tickets` | One row per ticket number, unique per `(raffle_id, ticket_number)`. |
| `draw_triggers` | The "pull the lever" mechanic — one live trigger per raffle. |
| `draw_results` | Provably-fair commit-reveal record, one per raffle. |
| `payouts` | Claim/fulfillment workflow + tax withholding, one per raffle. |
| `notifications` | SMS send log. |
| `audit_log` | Generic actor/action/entity compliance trail. |

Two views: `v_raffle_progress` (live ticket fill %) and
`v_user_raffle_odds` (per-user win probability) — both computed, not
materialized.

**Enforced at the database level, not just in application code** (defense
in depth — a bug in the API can't violate these):
- `enforce_max_tickets_per_user` — trigger on `tickets` insert.
- `enforce_ticket_number_within_cap` — trigger on `tickets` insert.
- `enforce_raffle_open_for_ticket_sale` — trigger on `tickets` insert.

## 6. Known gaps / technical debt

Kept here deliberately rather than swept under a "TODO" comment somewhere,
so priority calls can be made with the full picture.

- **Security — OTP bypass**: `auth.service.ts` accepts the codes `123456`
  or `000000` for *any* phone number, regardless of what was actually sent.
  This is a real authentication bypass if it ever reaches production.
  Flagged, not yet removed — needs an explicit decision, not a silent fix.
- **`otp_codes` table is unused.** OTP state lives in an in-memory `Map`,
  which doesn't survive a server restart and won't work if the API ever
  runs as more than one instance. Low risk at current scale, worth
  revisiting before horizontal scaling.
- **Draw and payout admin flows have no mobile UI.** The schema and
  business rules exist (§2.3, §2.4); building the actual trigger-click
  page, draw execution, and claim-verification UI is unstarted work,
  presumably admin-app's responsibility.
- **Telebirr is schema-supported, not integrated.** `payment_gateway` enum
  includes it; `tickets.service.ts` has a stub branch that returns
  "integration pending" rather than a real checkout.
- **`docs/README.md`'s "known mismatch" section is now stale** — it
  describes a schema/API mismatch that was real early in this project but
  has since been reconciled (verified: `users.queries.ts` already reads
  `phone_number`, not the old assumed column name, and the whole purchase
  flow has been tested end-to-end against the real schema this session).
  Corrected in that file rather than left contradicting this one.

## 7. Deployment

See `deploy/DEPLOY.md` — nginx configs for both the static mobile-app and
the API, a systemd unit for the API, and the exact env vars / build steps
to go from local dev to a real domain.
