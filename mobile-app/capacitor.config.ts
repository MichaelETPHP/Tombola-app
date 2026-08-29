import type { CapacitorConfig } from '@capacitor/cli';

// Installed apps use the bundled build by default. Set this only when a
// developer intentionally wants the device to live-reload from a dev URL.
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.tombola.app',
  appName: 'Tombola',
  webDir: 'build',
  ...(serverUrl && {
    server: {
      url: serverUrl,
      cleartext: serverUrl.startsWith('http://'),
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
