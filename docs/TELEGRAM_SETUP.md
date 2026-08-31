# Tombola Telegram setup

The application now supports one Tombola account on both surfaces:

- Telegram Mini App: signed `Telegram.WebApp.initData` is verified by the API and linked users enter automatically.
- Standalone PWA/Capacitor app: phone OTP only; Telegram login is never shown outside the Telegram Mini App.
- If Telegram does not share an Ethiopian phone number, the existing SMS OTP screen links the Telegram identity once.

## 1. Apply the database migration

Run `api/src/db/Migration/005_telegram_identity.sql` as the owner of the `Tombola_DB.users` table.

## 2. Configure BotFather

1. Create or select the Tombola bot.
2. Under **Mini App**, set the deployed HTTPS mobile-app URL as the Main Mini App URL.
3. Generate a fresh bot token for this same bot and store it only on the API service.

## 3. Configure the API

Set these only on the API server:

```env
TELEGRAM_BOT_TOKEN=123456789:replace-with-real-token
TELEGRAM_AUTH_MAX_AGE_SECONDS=3600
```

Never expose `TELEGRAM_BOT_TOKEN` in a Vite variable or commit it to source control.

## 4. Deploy and test

Telegram requires a public HTTPS Mini App URL. Localhost can still be used for the ordinary SMS flow, but real Mini App authentication should be tested from the bot after deployment.

For Android, build the web bundle, sync it, then assemble the APK:

```powershell
cd mobile-app
bun run build
bunx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The installed app uses the bundled web build. Set `CAPACITOR_SERVER_URL` only when intentionally live-reloading from a development server.
