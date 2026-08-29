import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { get } from 'svelte/store';
import { page } from '$app/stores';
import { goto } from '$app/navigation';
import { showExitHint } from '../stores/backExit.store.js';

/** The screens BottomNav links to — everything else is a "detail" screen reachable by going back. */
const ROOT_TABS = ['/home', '/raffles', '/wins', '/profile'];
const EXIT_PRESS_WINDOW_MS = 2000;

let lastBackPressAt = 0;
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;

/**
 * Wires the Android hardware/gesture back button to normal mobile-app
 * conventions instead of Capacitor's default (which just replays WebView
 * history, or exits immediately with no warning once history runs out):
 *   - On a detail screen (raffle detail, login, verify, ...): go back one screen.
 *   - On a root tab (home/raffles/wins/profile): require a second press
 *     within 2s to actually exit, showing a hint on the first press.
 * Call once from the root layout; no-ops on web (native only).
 */
export function initBackButtonHandling(): void {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;

  App.addListener('backButton', () => {
    const path = get(page).url.pathname;

    if (!ROOT_TABS.includes(path)) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        goto('/home');
      }
      return;
    }

    const now = Date.now();
    if (now - lastBackPressAt < EXIT_PRESS_WINDOW_MS) {
      App.exitApp();
      return;
    }

    lastBackPressAt = now;
    showExitHint.set(true);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => showExitHint.set(false), EXIT_PRESS_WINDOW_MS);
  });
}
