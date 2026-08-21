# Tombola Mobile App

Installable participant-facing app (SvelteKit built as a static SPA, wrapped
in Capacitor for iOS/Android). Talks to the `api` project over HTTP only.

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
bun run dev                  # → http://localhost:5173

# Type check
bun run check

# Build the static site (output: build/)
bun run build
```

## Capacitor (native builds)

```bash
# Build the web app first
bun run build

# Add native platforms (one-time)
bunx cap add ios
bunx cap add android

# Sync the built web assets into the native projects
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
