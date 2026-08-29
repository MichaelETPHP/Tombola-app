# Tombola Mobile App

Installable participant-facing app (SvelteKit built as a static SPA). Talks
to the `api` project over HTTP only. Ships two ways from the same codebase:

- **PWA** — the site itself is installable from a mobile browser (manifest,
  service worker, home-screen icons). No app store needed.
- **Native shell (Capacitor)** — a thin Android/iOS wrapper that loads the
  *deployed* PWA URL directly (not the bundled build) via `capacitor.config.ts`'s
  `server.url`. The bundled `build/` output only serves as an offline
  fallback (cached by the same service worker) — shipping a content update
  is a normal web deploy, not an app store resubmission.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- The `api` project running locally (or a deployed URL)
- Xcode (iOS) and/or Android Studio (Android) — only needed to build native
  shells with Capacitor, not for web development

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

# Start the dev server (web preview)
bun run dev                  # → http://localhost:4345

# Type check
bun run check

# Build the static site (output: build/)
bun run build
```

## PWA

`bun run build` also generates a web app manifest, a Workbox service worker
(`registerType: 'autoUpdate'`), and home-screen icons (`static/icons/`,
`static/apple-touch-icon.png`, `static/favicon.png` — replace these
placeholders with real branded artwork before shipping). Visiting the
deployed site on a phone offers "Add to Home Screen" with no native build
required. Configuration lives in `vite.config.ts` (the `SvelteKitPWA` plugin
options); the service worker registers itself from `src/routes/+layout.svelte`.

## Capacitor (native builds)

`capacitor.config.ts` points the native shell at a URL rather than the
bundled build — set it once you have a real deployment:

| Where | What |
|---|---|
| `CAPACITOR_SERVER_URL` env var | Overrides everything, no file edit needed |
| `PRODUCTION_URL` in `capacitor.config.ts` | Fallback used when the env var isn't set and `NODE_ENV !== 'development'` — currently a placeholder, **replace it before building for production** |
| Dev (`NODE_ENV=development`) | Always `http://localhost:4345`, so the native shell live-reloads against your dev server |

```bash
# Build the web app first (produces the offline-fallback bundle + PWA assets)
bun run build

# Add native platforms (one-time; needs the Android SDK / Xcode installed —
# not run as part of this scaffold)
bunx cap add ios
bunx cap add android

# Sync the built web assets + capacitor.config.ts into the native projects
bunx cap sync

# Open in Xcode / Android Studio
bunx cap open ios
bunx cap open android
```

## Structure

- `src/routes/(auth)` — phone + OTP login flow
- `src/routes/(app)` — authenticated screens (home, raffles, wins, tickets, profile), wrapped in the bottom nav layout
- `src/lib/components` — design-system components (`StatCard`, `ProgressRing`, `BottomNav`, `Button`, `RaffleCard`, `OddsBadge`)
- `src/lib/theme/tokens.ts` — single source of truth for colors/spacing/radii; components read from here or the matching CSS custom properties in `app.css`, never hardcoded hex values
- `src/lib/stores` — Svelte stores for auth (in-memory access token) and raffle data
- `src/lib/api/client.ts` — fetch wrapper: attaches the bearer token, retries once through `/auth/refresh` on a 401
- `src/lib/schemas` — Zod schemas mirroring the API's request/response shapes

## Auth model

The access token lives only in a Svelte store (memory) and is lost on reload
by design — the root layout (`src/routes/+layout.svelte`) silently calls
`POST /auth/refresh` on boot to mint a new one from the httpOnly refresh
cookie set by the API.
