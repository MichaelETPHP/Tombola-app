import { goto } from '$app/navigation';

// Hybrid WebViews (Capacitor on Android in particular) can report
// `window.history.length` as already greater than 1 on the very first
// screen the app renders — the WebView counts its own loader entry. That
// made `history.back()` fire with no real in-app screen to return to, so
// the button silently did nothing instead of going anywhere. Track actual
// client-side navigations ourselves instead of trusting the browser's count.
let hasNavigatedWithinApp = false;

/** Call once per client-side route change (wired from the root layout's `afterNavigate`). */
export function markInAppNavigation(): void {
  hasNavigatedWithinApp = true;
}

/**
 * Real back navigation when there's a previous screen in this app session
 * to return to (preserves scroll position, filter state, etc.) — only
 * falls back to Home when there isn't, e.g. this screen was opened
 * directly via a deep link with no prior screen in this session.
 */
export function navigateBack(): void {
  if (hasNavigatedWithinApp) {
    history.back();
  } else {
    goto('/home');
  }
}
