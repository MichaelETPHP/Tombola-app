import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { goto } from '$app/navigation';
import { api } from '$lib/api/client.js';
import { showBanner } from '$lib/stores/banner.store.js';

/**
 * "User backed out of checkout" handler, used by routes/(app)/checkout's
 * own back button. Cancels the payment server-side — atomically
 * conditioned on it still being 'pending', so this can never race a
 * webhook/verify call that completed it in the same instant — then routes
 * accordingly: to the real receipt if it turns out the payment had
 * already gone through, otherwise Home with a toast confirming nothing
 * was charged.
 */
export async function cancelPaymentAndReturnHome(paymentId: string): Promise<void> {
  try {
    const { payment } = await api.post<{ payment: { status: string; raffleId: string } }>(`/payments/${paymentId}/cancel`);
    if (payment.status === 'failed') {
      await goto(`/raffles/${payment.raffleId}/numbers`, { replaceState: true });
      showBanner('Your unpaid reservation was released');
    } else {
      await goto(`/payments/${paymentId}`, { replaceState: true });
    }
  } catch {
    await goto(`/payments/${paymentId}`, { replaceState: true });
    showBanner('Check your payment status before starting again');
  }
}

/**
 * Open an external URL (Chapa checkout) for the payment flow. Native apps
 * use an in-app browser tab (Custom Tabs on Android) — a separate browser
 * context from the app's own WebView, so it isn't subject to Capacitor's
 * cross-origin navigation restrictions and reads as more trustworthy for
 * a payment page. Web/PWA falls back to a normal same-tab redirect — unless
 * the URL is actually same-origin (MOCK_PAYMENTS' /mock-checkout, part of
 * this same app), in which case a full reload would just needlessly
 * re-trigger the boot splash for what's really internal navigation.
 *
 * Returns whether the caller should *also* navigate itself afterward
 * (e.g. to a "waiting for payment" screen). Only true for native — there,
 * checkout opens in a separate tab and this returns immediately, so the
 * caller needs to navigate the main app on its own. For same-origin web
 * navigation, this call already took over navigation (the mock checkout
 * page handles moving on once the user finishes); a follow-up goto() from
 * the caller would immediately stomp on it. For real cross-origin web
 * redirects the page has already navigated away, so the return value is
 * moot — nothing after this call ever runs.
 */
export async function openExternal(url: string): Promise<{ opensSeparately: boolean }> {
  // The local mock checkout is part of this Svelte app. Keep it inside the
  // WebView on every platform so auth/session state and the return route stay
  // intact while testing the complete flow.
  if (new URL(url, window.location.origin).origin === window.location.origin) {
    const path = url.replace(window.location.origin, '');
    await goto(path);
    return { opensSeparately: false };
  }

  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return { opensSeparately: true };
  }

  window.location.href = url;
  return { opensSeparately: false };
}

export function paymentReturnTarget(): 'native' | 'web' {
  return Capacitor.isNativePlatform() ? 'native' : 'web';
}

/**
 * Opens Chapa checkout for the payment flow — the SAME in-app page
 * (routes/(app)/checkout) on every surface: native APK, Telegram Mini App,
 * and plain web/PWA. That page renders Chapa's own Inline.js widget
 * directly into our own DOM — no iframe, no redirect, no separate browser
 * tab or Custom Tab anywhere. It's safe everywhere for the same reason:
 * the widget talks to Chapa via Bearer-token fetch/FormData calls, not
 * cookies, so none of the CSRF/cookie restrictions that broke an earlier
 * iframe attempt apply, and unlike a hosted-page redirect there's no
 * separate browsing context to ever "open in a browser" in the first
 * place — on any platform.
 *
 * (checkoutUrl is still threaded through as a last-resort fallback link
 * for the rare case where Chapa's script itself fails to load — see that
 * page's `scriptError` state.)
 *
 * Always navigates itself (there's no "opens separately" case anymore —
 * every path lands in-app), so the caller doesn't need to.
 */
export async function openCheckout(
  url: string | undefined,
  paymentId: string
): Promise<void> {
  // MOCK_PAYMENTS' /mock-checkout is part of this same app — same
  // same-origin handling as openExternal, so local testing isn't forced
  // through the inline widget it doesn't need.
  if (url && new URL(url, window.location.origin).origin === window.location.origin) {
    const path = url.replace(window.location.origin, '');
    await goto(path);
    return;
  }

  const params = new URLSearchParams({ paymentId });
  await goto(`/checkout?${params.toString()}`);
}
