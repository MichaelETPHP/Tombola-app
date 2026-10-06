import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { goto } from '$app/navigation';
import { api } from '$lib/api/client.js';
import { showBanner } from '$lib/stores/banner.store.js';
import { clearPendingPurchase } from '$lib/stores/pendingPurchase.js';

/**
 * "User backed out of checkout" handler, used by routes/(app)/checkout's
 * own back button. Cancels the payment server-side — atomically
 * conditioned on it still being 'pending', so this can never race a
 * webhook/verify call that completed it in the same instant — then routes
 * accordingly: to its receipt if payment completed, otherwise back to the
 * raffle's embedded number selection. A released reservation does not assert that a gateway
 * could never report a late debit; those payments go to refund review.
 */
export async function cancelPaymentAndReturnHome(paymentId: string): Promise<void> {
  try {
    const { payment } = await api.post<{ payment: { status: string; raffleId: string } }>(`/payments/${paymentId}/cancel`);
    if (payment.status === 'failed') {
      clearPendingPurchase();
      await goto(`/raffles/${payment.raffleId}`, { replaceState: true });
      showBanner(get(_)('apiErrors.reservationCancelled'));
    } else {
      await goto(`/payments/${paymentId}`, { replaceState: true });
    }
  } catch {
    await goto(`/payments/${paymentId}`, { replaceState: true });
    showBanner(get(_)('apiErrors.checkPaymentStatus'));
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
 * Opens Chapa checkout for the payment flow.
 *
 * - Same-origin checkoutUrl (MOCK_PAYMENTS' /mock-checkout) navigates
 *   in-app via SPA routing, same as openExternal's own same-origin case.
 * - A real cross-origin checkoutUrl (Chapa's hosted checkout.chapa.co page
 *   — used while direct charges await Chapa's merchant approval, see
 *   tickets.service.ts) goes through openExternal: Custom Tab on native,
 *   same-tab redirect on web.
 * - No checkoutUrl at all falls back to the in-app Inline.js widget page
 *   (routes/(app)/checkout) — only reachable today if direct charges get
 *   re-enabled as the default without restoring a checkoutUrl-less path.
 */
export async function openCheckout(
  url: string | undefined,
  paymentId: string
): Promise<void> {
  if (url) {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) {
      await goto(target.pathname + target.search);
      return;
    }
    const { opensSeparately } = await openExternal(url);
    // Native opened a separate Custom Tab and returned immediately — the
    // app itself still needs to move to the waiting/receipt screen. Web's
    // same-tab redirect already navigated away, so this never runs there.
    if (opensSeparately) await goto(`/payments/${paymentId}`);
    return;
  }

  const params = new URLSearchParams({ paymentId });
  await goto(`/checkout?${params.toString()}`);
}
