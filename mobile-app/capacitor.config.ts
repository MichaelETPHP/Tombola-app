import type { CapacitorConfig } from '@capacitor/cli';

// Installed apps use the bundled build by default. Set this only when a
// developer intentionally wants the device to live-reload from a dev URL.
const serverUrl = process.env.CAPACITOR_SERVER_URL;
const allowLocalDevelopmentHttp = process.env.CAPACITOR_ALLOW_HTTP === 'true';

const config: CapacitorConfig = {
  appId: 'com.tombola.app',
  appName: 'Tombola',
  webDir: 'build',
  android: {
    // Required only for debug APKs calling a LAN API over http://.
    // Production builds must use HTTPS and leave this flag unset.
    allowMixedContent: allowLocalDevelopmentHttp,
  },
  ...(serverUrl && {
    server: {
      url: serverUrl,
      cleartext: serverUrl.startsWith('http://'),
      // A bundled local page (ships in the APK, zero network needed) that
      // replaces Chromium's raw "Webpage not available" error screen when
      // the dev server can't be reached — only relevant to this live-reload
      // dev mode, since a production build never navigates to a remote
      // origin at all.
      errorPath: 'offline.html',
    },
  }),
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
