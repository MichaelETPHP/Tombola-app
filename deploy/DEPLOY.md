# Deploying Tombola to your VPS

Two things get deployed: the API (Bun/Hono) and the mobile-app (static
SvelteKit build). The Android APK is built once locally and just points at
the deployed mobile-app URL — after that, shipping updates is "deploy the
web app," never "rebuild and redistribute the APK."

## 1. Push code to the VPS

However you'd normally get code onto the server (git pull, rsync, CI) — get
the repo onto the VPS. This guide assumes `/path/to/Tombola-app`.

## 2. API

```bash
cd /path/to/Tombola-app/api
bun install --production
cp .env.example .env   # then fill in real values — see below
```

Fill in `api/.env` with production values. Two things worth double-checking
given what came up in local testing:
- `DATABASE_URL` — your production Postgres connection string.
- `SMS_API_URL` / `SMS_API_KEY` — a **real** SMS gateway. If left as
  placeholders, every login attempt will fail (the app has no dev-mode
  fallback once `NODE_ENV=production`).
- `CHAPA_SECRET_KEY` — your real Chapa merchant key, or ticket purchases
  will fail at the payment-initialization step.
- `CORS_ORIGINS` — must include your real mobile-app domain, e.g.
  `https://app.yourdomain.com`.

Then:

```bash
sudo cp deploy/tombola-api.service /etc/systemd/system/
# edit WorkingDirectory + bun path first (see comments in the file)
sudo systemctl daemon-reload
sudo systemctl enable --now tombola-api

sudo cp deploy/api.nginx.conf /etc/nginx/sites-available/tombola-api
# edit server_name first
sudo ln -s /etc/nginx/sites-available/tombola-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com
```

## 3. Mobile-app (the PWA)

The API URL is baked into the static build at build time — set it **before**
building:

```bash
cd /path/to/Tombola-app/mobile-app
echo "VITE_API_URL=https://api.yourdomain.com" > .env
bun install
bun run build          # writes to ./build
sudo mkdir -p /var/www/tombola-mobile-app
sudo cp -r build /var/www/tombola-mobile-app/

sudo cp deploy/mobile-app.nginx.conf /etc/nginx/sites-available/tombola-app
# edit server_name first
sudo ln -s /etc/nginx/sites-available/tombola-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.yourdomain.com
```

Visit `https://app.yourdomain.com` and confirm the raffles load with real
data before moving on.

## 4. Point the Android shell at the live site

Back on your dev machine, in `mobile-app/capacitor.config.ts`, replace the
placeholder:

```ts
const PRODUCTION_URL = 'https://your-production-domain.example.com';
```

with your real domain, e.g. `https://app.yourdomain.com`. Then:

```bash
cd mobile-app
bun run build
bunx cap sync android
cd android
./gradlew.bat assembleDebug   # or assembleRelease for a signed build
```

The resulting APK (`android/app/build/outputs/apk/debug/app-debug.apk`)
loads `https://app.yourdomain.com` directly — install it once on a device.

## 5. Shipping updates from here on

Repeat step 3 (build + copy to `/var/www/tombola-mobile-app` + reload nginx)
whenever you change the mobile-app. Every device with the app installed
picks up the new content the next time it's opened — no new APK, no
reinstall, no app-store review. Only touch Android again (step 4) for
things the *native shell* controls: the app icon, splash screen, permissions,
or the target domain itself.
