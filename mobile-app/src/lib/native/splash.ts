import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

/**
 * Hides the native splash (launchAutoHide is off in capacitor.config.ts)
 * and fades out the web boot-splash overlay from app.html. Call once the
 * app actually has content to show — after the root layout's initial auth
 * check settles — so there's never a blank-white gap between "native
 * splash disappears" and "hydrated content appears".
 */
export async function hideBootSplash(): Promise<void> {
  const el = document.getElementById('boot-splash');
  if (el) {
    el.classList.add('boot-splash--hidden');
    setTimeout(() => el.remove(), 360);
  }

  // The app actually rendered — clear the stale-chunk self-heal flag from
  // app.html so a *future* deploy can still trigger exactly one more
  // automatic reload if it hits the same stale-service-worker symptom,
  // instead of the guard permanently blocking after the first time.
  try {
    sessionStorage.removeItem('yeneeta:stale-chunk-reload');
  } catch {
    // No sessionStorage available — nothing to clear.
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await SplashScreen.hide();
    } catch {
      // Nothing more to do if the native bridge call fails — the web
      // overlay above already handles the visible transition.
    }
  }
}
