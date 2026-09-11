<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { afterNavigate, goto } from '$app/navigation';
  import { markInAppNavigation } from '$lib/native/navigateBack.js';
  import { App } from '@capacitor/app';
  import { Browser } from '@capacitor/browser';
  import { Capacitor } from '@capacitor/core';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, setAuth, setAuthLoading } from '$lib/stores/auth.store.js';
  import { hideBootSplash } from '$lib/native/splash.js';
  import { initBackButtonHandling } from '$lib/native/backButton.js';
  import { disableZoom } from '$lib/native/disableZoom.js';
  import BackExitToast from '$lib/components/BackExitToast.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import ConnectivityGate from '$lib/components/ConnectivityGate.svelte';
  import '../app.css';
  import { initLanguage, setLanguage } from '$lib/stores/language.store.js';
  import { authenticateTelegramMiniApp, prepareTelegramMiniApp } from '$lib/telegram.js';

  // registerType: 'autoUpdate' — the service worker swaps itself in on the
  // next load once a new version is precached, no user prompt needed.
  useRegisterSW({ immediate: true });

  type MeResponse = {
    user: { id: string; phone: string; fullName: string | null; preferredLanguage?: 'en' | 'am' };
  };

  $: directDrawRoute = $page.url.pathname.startsWith('/draw/');

  afterNavigate((navigation) => {
    if (navigation.from) markInAppNavigation();
  });

  async function handleNativePaymentReturn(rawUrl: string | undefined): Promise<void> {
    if (!rawUrl) return;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'yeneeta:' || url.hostname !== 'payment-return') return;
      const paymentId = url.searchParams.get('payment_id') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return;
      // Checkout itself now runs in-app (routes/(app)/checkout) and never
      // triggers this deep link on success — this only ever fires via the
      // scriptError fallback's hosted-checkout redirect, so Browser.close()
      // just cleans up whatever external/Custom-Tab context that opened.
      await Browser.close().catch(() => undefined);
      await goto(`/payments/${paymentId}`, { replaceState: true });
    } catch {
      // Ignore unrelated or malformed operating-system URLs.
    }
  }

  async function restorePhoneSession(): Promise<void> {
    const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, { skipAuth: true });
    const me = await api.get<MeResponse>('/users/me');
    if (me.user.preferredLanguage) setLanguage(me.user.preferredLanguage);
    setAuth(refreshed.accessToken, me.user);
  }

  /**
   * Telegram Mini Apps always authenticate from Telegram's signed launch
   * data. Native/PWA launches restore the phone session from the refresh
   * cookie. Keeping these paths separate prevents one platform's login
   * method from leaking into the other.
   */
  onMount(async () => {
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appUrlOpen', ({ url }) => handleNativePaymentReturn(url));
      void App.getLaunchUrl().then((launch) => handleNativePaymentReturn(launch?.url));
    }
    initBackButtonHandling();
    disableZoom();
    await initLanguage();

    if (directDrawRoute) {
      // This route is an intentionally public, one-time SMS experience.
      // It needs neither auth restoration nor any app-shell overlays.
      setAuthLoading(false);
      await hideBootSplash();
      return;
    }

    // Network restoration continues behind precise skeleton states; never
    // hold the native/HTML splash on a slow request.
    const splashSafetyTimer = setTimeout(hideBootSplash, 120);

    const telegram = prepareTelegramMiniApp();
    try {
      if (telegram) {
        try {
          const result = await authenticateTelegramMiniApp(telegram);
          // A returning, already-linked Telegram account signs in
          // silently here. A first-time account gets 'contact_required'
          // — there's no way to finish that without the user tapping
          // "Continue with Telegram" themselves (the actual phone-share
          // flow lives on the login screen, see login/+page.svelte), so
          // there's nothing to do here but leave them signed out.
          // Browsing stays guest-accessible either way — no forced
          // redirect to login, same as any other visitor.
          if (result.status === 'authenticated') {
            if (result.user.preferredLanguage) setLanguage(result.user.preferredLanguage);
            setAuth(result.accessToken, result.user);
          } else {
            setAuthLoading(false);
          }
        } catch (telegramError) {
          console.error('Telegram Mini App login failed', telegramError);
          setAuthLoading(false);
        }
      } else {
        try {
          await restorePhoneSession();
        } catch (refreshError) {
          if (refreshError instanceof ApiError && refreshError.status === 401) {
            // Genuinely no valid session — not an error, just signed out.
            setAuthLoading(false);
          } else {
            // Transient failure (network blip, a container's first
            // request after being idle) — one retry before accepting
            // "not signed in for this boot", rather than treating a
            // single bad request as a real logout.
            console.error('Session restore failed, retrying once', refreshError);
            await new Promise((resolve) => setTimeout(resolve, 1200));
            try {
              await restorePhoneSession();
            } catch (retryError) {
              if (!(retryError instanceof ApiError && retryError.status === 401)) {
                console.error('Session restore failed on retry', retryError);
              }
              setAuthLoading(false);
            }
          }
        }
      }
    } finally {
      // Only now do we know whether there's a signed-in user or not — hide
      // the boot splash here rather than at mount so the handoff never
      // reveals a flash of the wrong auth state.
      clearTimeout(splashSafetyTimer);
      hideBootSplash();
    }
  });
</script>

<slot />
{#if !directDrawRoute}
  <BackExitToast />
  <Banner />
  <ConnectivityGate />
{/if}
