import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tombola.app',
  appName: 'Tombola',
  webDir: 'build',
  server: {
    // In development, proxy to the Vite dev server
    ...(process.env.NODE_ENV === 'development' && {
      url: 'http://localhost:5173',
      cleartext: true,
    }),
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#E3F9EF',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#00D3A0',
    },
  },
};

export default config;
