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

  // This clears the stale-chunk self-heal flag (app.html + the root
  // layout's <svelte:boundary>) so a *future* deploy can still trigger one
  // more automatic reload, instead of the guard blocking forever after the
  // first time — BUT it used to clear it right here, immediately, which
  // was a real bug: hideBootSplash() runs once auth restoration settles,
  // which says nothing about whether the actual page content below it is
  // about to render cleanly. If the underlying cause wasn't actually
  // transient (a genuinely broken build, not just a stale cached one), the
  // page would auto-reload once, immediately clear its own guard here
  // before the *reloaded* page even finished mounting, crash again in the
  // exact same way, and reload again — forever, hammering the API (this is
  // what was behind repeated /auth/refresh 429s: every loop iteration
  // re-ran the boot sequence's own refresh attempts). Waiting a few
  // seconds first means a render-time crash from the reload has time to
  // happen and be caught — with the flag still set — before this ever
  // re-arms the guard, capping it at one reload per real problem instead
  // of an unbounded loop.
  setTimeout(() => {
    try {
      sessionStorage.removeItem('yeneeta:stale-chunk-reload');
    } catch {
      // No sessionStorage available — nothing to clear.
    }
  }, 8000);

  if (Capacitor.isNativePlatform()) {
    try {
      await SplashScreen.hide();
    } catch {
      // Nothing more to do if the native bridge call fails — the web
      // overlay above already handles the visible transition.
    }
  }
}
