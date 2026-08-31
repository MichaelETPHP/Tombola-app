import type { CapacitorConfig } from '@capacitor/cli';

// The installed app always points at a live server — CAPACITOR_SERVER_URL
// overrides this for local dev-mode live-reload; every other build (i.e.
// every real release) falls back to the production domain. This is a
// deliberate choice: the APK is a thin native shell around the deployed
// site rather than a bundled snapshot, so a `git push` + Coolify deploy
// reaches every already-installed phone immediately (a pull-to-refresh —
// or even just reopening the app — always loads whatever's live right
// now), and no new APK build is ever needed again for pure web/API
// changes. The tradeoff: the app needs network to open at all, which is
// exactly what offline.html (below) exists to handle gracefully.
const PRODUCTION_URL = 'https://imrnjcyuifazcrr0v361sm18.187.77.12.130.sslip.io';
const serverUrl = process.env.CAPACITOR_SERVER_URL || PRODUCTION_URL;
const allowLocalDevelopmentHttp = process.env.CAPACITOR_ALLOW_HTTP === 'true';

const config: CapacitorConfig = {
  appId: 'com.tombola.app',
  appName: 'Tombola',
  webDir: 'build',
  android: {
    // Required only for a debug build calling a LAN API over http://.
    // Production always uses HTTPS and leaves this flag unset.
    allowMixedContent: allowLocalDevelopmentHttp,
  },
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    // A page bundled locally in the APK itself (zero network needed) that
    // replaces Chromium's raw "Webpage not available" error screen when
    // the live server can't be reached — matters in production now too,
    // not just dev, since every page load is a real network request.
    errorPath: 'offline.html',
  },
  plugins: {
    SplashScreen: {
      // Dismissed by the root layout after authentication is restored.
      launchAutoHide: false,
      backgroundColor: '#E3F9EF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#00D3A0',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
