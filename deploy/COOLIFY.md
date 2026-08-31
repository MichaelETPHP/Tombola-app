# Deploying to Coolify (Docker)

This is the Docker/Coolify path — three containers (`api`, `mobile-app`,
`admin-app`) built from `docker-compose.yml` at the repo root. For the
older bare-metal/systemd path, see [`DEPLOY.md`](./DEPLOY.md); the two are
independent, pick one.

Since this VPS hosts other Coolify projects too, everything here is written
to avoid touching anything outside this project: no host ports are bound in
`docker-compose.yml` (see the comment at its top), and Compose gives every
project its own private Docker network automatically, so this can't collide
with — or see — whatever else is running on the box.

Each Dockerfile is production-hardened: base images are pinned to a specific
version (not a floating `latest`/major-only tag, so a stray upstream release
can't change what gets deployed), every service runs as a non-root user
inside its container, and each has a `HEALTHCHECK` Coolify's own monitoring
can read directly (`api` and `admin-app` hit their own HTTP endpoint via
Bun's `fetch`; `mobile-app` uses `wget` against nginx). `mobile-app` and
`admin-app` won't even start until `api`'s health check passes
(`depends_on: condition: service_healthy`).

## 1. Create the resource in Coolify

In your Coolify dashboard: **New Resource → Docker Compose**, point it at
this repo, and leave the Compose file path as `docker-compose.yml` (repo
root — the Dockerfiles reach into `deploy/` and each service's own folder,
so the build context has to be the root, not a subdirectory).

Coolify will read the three services out of the compose file. Each gets its
own tab in the dashboard for env vars, build vars, and domain.

## 2. Build-time vs runtime variables — don't mix these up

`mobile-app` and `admin-app` read `VITE_API_URL` at **build** time (Vite
inlines it into the compiled JS — `import.meta.env.VITE_API_URL` in
`src/lib/api/client.ts`). Setting it as a normal runtime env var does
nothing; it has to be a **Build Variable** in Coolify, on both of those
services, set to the API's real public URL:

```
VITE_API_URL=https://api.yourdomain.com
```

If you ever change this later, you must trigger a rebuild (not just a
restart) of `mobile-app` and `admin-app` for it to take effect.

Everything else below is a normal runtime **Environment Variable**.

## 3. Environment variables

Set these on the **`api`** service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Postgres/Supabase connection string |
| `DB_SCHEMA` | `Tombola_DB` |
| `DB_SSL` | `false` (or `true` if your DB requires it) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `openssl rand -hex 64`, two different values |
| `CORS_ORIGINS` | `https://app.yourdomain.com,https://admin.yourdomain.com,https://localhost,capacitor://localhost` — public web domains plus the Capacitor native-app origins |
| `MOBILE_APP_URL` | `https://app.yourdomain.com` — used to build the Chapa `return_url` |
| `DEMO_OTP_ENABLED` | `true` for now — see "Mock data" below |
| `MOCK_PAYMENTS` | `true` for now — see "Mock data" below |
| `SMS_API_URL`, `SMS_API_KEY`, `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `TELEBIRR_APP_ID`, `TELEBIRR_APP_KEY` | leave as placeholders until those integrations are actually ready |

Set this on the **`admin-app`** service:

| Variable | Value |
|---|---|
| `ORIGIN` | `https://admin.yourdomain.com` — adapter-node needs this behind a reverse proxy, or form submissions/CSRF checks fail |

`mobile-app` needs no runtime env vars — it's a static nginx build.

## 4. Domains

In each service's **Domains** tab in Coolify, assign:

- `api` → `api.yourdomain.com` (container port `3435`)
- `mobile-app` → `app.yourdomain.com` (container port `80`)
- `admin-app` → `admin.yourdomain.com` (container port `5355`)

Coolify wires its proxy to each container over the internal network using
these ports — that's why `docker-compose.yml` doesn't publish host ports
itself.

## 5. Deploy order

Env vars (especially `VITE_API_URL`) have to exist **before** the first
build, since they get baked into `mobile-app`/`admin-app` at build time.
Set everything in steps 2–4 first, then trigger the deploy — Coolify builds
all three from the one compose file in a single deployment.

Check `api` came up cleanly by hitting `https://api.yourdomain.com/health`
before checking the other two.

## 6. Mock data — what's real and what isn't right now

Per the current state of this project, two things are intentionally mocked
rather than wired to real providers:

- **OTP delivery** (`DEMO_OTP_ENABLED=true`) — `123456` works as the login
  code for any phone number. No SMS gateway is called. Real codes still
  work too if `SMS_API_URL`/`SMS_API_KEY` are ever filled in, but with them
  blank the server just logs the code instead of sending it.
- **Payments** (`MOCK_PAYMENTS=true`) — ticket purchases skip real Chapa
  and go through mobile-app's `/mock-checkout` page instead. The real
  webhook → ticket-issuance flow still runs end-to-end against your
  database; only the "charge a card" step is faked.

Flip `DEMO_OTP_ENABLED` and `MOCK_PAYMENTS` to `false` (and fill in the
real `SMS_API_*`/`CHAPA_*` credentials) once those integrations are ready —
covered in more detail in `SOFTWARE_REQUIREMENTS.md`'s "Known gaps"
section.

## 7. Point the Android shell at the live site

Same as the bare-metal guide — see
[`DEPLOY.md` § 4](./DEPLOY.md#4-point-the-android-shell-at-the-live-site).
`capacitor.config.ts`'s `PRODUCTION_URL` should be `https://app.yourdomain.com`
regardless of which deployment method served it.

## 8. Shipping updates from here on

Push to the branch Coolify is tracking (or hit **Redeploy** in the
dashboard) — it rebuilds all three containers from the compose file. No
manual `docker build`/`cp`/nginx-reload steps like the bare-metal path.
