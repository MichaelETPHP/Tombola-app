import { Browser } from '@capacitor/browser';
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';
import { Capacitor } from '@capacitor/core';
import { goto } from '$app/navigation';
import { getTelegramMiniApp } from '$lib/telegram.js';
import { api } from '$lib/api/client.js';
import { showBanner } from '$lib/stores/banner.store.js';

/**
 * Shared "user backed out of checkout" handler for every surface (native
 * close button, the Telegram in-app checkout page's back button). Cancels
 * the payment server-side — atomically conditioned on it still being
 * 'pending', so this can never race a webhook/verify call that completed
 * it in the same instant — then routes accordingly: to the real receipt
 * if it turns out the payment had already gone through, otherwise Home
 * with a toast confirming nothing was charged.
 */
export async function cancelPaymentAndReturnHome(paymentId: string): Promise<void> {
  let completed = false;
  try {
    const { payment } = await api.post<{ payment: { status: string } }>(`/payments/${paymentId}/cancel`);
    completed = payment.status === 'completed';
  } catch {
    // Best-effort — even if this specific request fails, the background
    // stale-payment sweep (api/src/jobs/stale-payment-check.job.ts) still
    // guarantees the payment never lingers as 'pending' forever.
  }
  if (completed) {
    await goto(`/payments/${paymentId}`, { replaceState: true });
    return;
  }
  await goto('/home', { replaceState: true });
  showBanner('Payment was cancelled');
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

// Mirrors BottomNav.svelte + app.css's .native-bottom-nav-position exactly
// (76px bar, floating 16px above the safe-area bottom inset) — read the
// live --safe-bottom value via a probe element rather than hardcoding a
// device-specific inset, since it already varies by device by design.
function bottomNavFootprintPx(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--safe-bottom, 0px);';
  document.body.appendChild(probe);
  const safeBottom = parseFloat(getComputedStyle(probe).height) || 0;
  probe.remove();
  return 76 + 16 + safeBottom;
}

/**
 * Opens the Chapa checkout URL for the payment flow specifically — unlike
 * openExternal's Custom Tab (which still shows Chrome's own toolbar/URL
 * bar and reads as "leaving the app"), this renders the checkout page in
 * a managed native WebView presented as part of the app itself, with just
 * a plain close button and no address bar. Chapa's own return_url
 * redirect, and this app's existing yeneeta:// hand-off from that return
 * page, both keep working unchanged — the plugin forwards that custom
 * scheme to the OS exactly like a normal browser would.
 *
 * Inside the Telegram Mini App there is no Capacitor host and no native
 * plugin to size — Telegram's own external-link handling is entirely
 * outside this app's control, so a raw redirect there would blank out the
 * whole app (bottom nav included). Checkout instead opens on an in-app
 * route that iframes it alongside the normal (app) shell — see
 * routes/(app)/checkout/+page.svelte for why that page polls for
 * completion itself rather than trusting Chapa's return_url, which lands
 * *inside* the iframe, not on this outer page.
 */
export async function openCheckout(url: string, paymentId: string): Promise<{ opensSeparately: boolean }> {
  // MOCK_PAYMENTS' /mock-checkout is part of this same app — same
  // same-origin handling as openExternal, so local testing isn't forced
  // through a native webview it doesn't need.
  if (new URL(url, window.location.origin).origin === window.location.origin) {
    const path = url.replace(window.location.origin, '');
    await goto(path);
    return { opensSeparately: false };
  }

  if (getTelegramMiniApp()) {
    await goto(`/checkout?paymentId=${encodeURIComponent(paymentId)}&url=${encodeURIComponent(url)}`);
    return { opensSeparately: false };
  }

  if (Capacitor.isNativePlatform()) {
    // Stops short of the very bottom of the screen so the app's own
    // BottomNav — rendered underneath, in the host WebView — stays
    // visible and tappable rather than being fully covered by checkout.
    // Taps in that now-exposed strip pass through to the host app; taps
    // on the checkout itself still go to Chapa's page as normal.
    const height = Math.max(320, window.innerHeight - bottomNavFootprintPx());
    const { id } = await InAppBrowser.openWebView({
      url,
      title: 'Secure checkout',
      toolbarType: ToolBarType.COMPACT,
      toolbarColor: '#00D3A0',
      toolbarTextColor: '#ffffff',
      // The toolbar (and its close button) must never sit under the
      // system status bar — without both of these, some Android versions
      // render the toolbar flush with the top edge before the safe-area
      // inset is applied, leaving the close button hidden behind the
      // status bar's own icons/clock.
      enabledSafeTopMargin: true,
      useTopInset: true,
      height,
    });
    // closeEvent fires specifically for the toolbar close-button tap — not
    // for the programmatic InAppBrowser.close() the successful-payment
    // deep-link handler (routes/+layout.svelte) calls once Chapa confirms
    // payment, so this only ever fires on a genuine user cancel.
    const handle = await InAppBrowser.addListener('closeEvent', async (event) => {
      if (event.id && event.id !== id) return;
      await handle.remove();
      await cancelPaymentAndReturnHome(paymentId);
    });
    return { opensSeparately: true };
  }

  window.location.href = url;
  return { opensSeparately: false };
}
