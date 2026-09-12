<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { page } from '$app/stores';
  import { afterNavigate, goto } from '$app/navigation';
  import { markInAppNavigation } from '$lib/native/navigateBack.js';
  import { App } from '@capacitor/app';
  import { Browser } from '@capacitor/browser';
  import { Capacitor } from '@capacitor/core';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { api, ApiError, API_BASE, setTelegramReauth } from '$lib/api/client.js';
  import { auth, setAuth, setAuthLoading } from '$lib/stores/auth.store.js';
  import { hideBootSplash } from '$lib/native/splash.js';
  import { initBackButtonHandling } from '$lib/native/backButton.js';
  import { disableZoom } from '$lib/native/disableZoom.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { RefreshCw, TriangleAlert } from 'lucide-svelte';
  import BackExitToast from '$lib/components/BackExitToast.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import ConnectivityGate from '$lib/components/ConnectivityGate.svelte';
  import '../app.css';
  import { initLanguage, setLanguage } from '$lib/stores/language.store.js';
  import { authenticateTelegramMiniApp, prepareTelegramMiniApp } from '$lib/telegram.js';

  // registerType is 'prompt' (see vite.config.ts) specifically so this
  // toast can exist at all: vite-plugin-pwa's client code for 'autoUpdate'
  // never calls onNeedRefresh — it auto-activates a new service worker the
  // instant it finishes installing (skipWaiting + clientsClaim) and reloads
  // unconditionally on its own, which is what was actually causing "the
  // page breaks a few seconds after a fresh deploy": a first-time visitor's
  // own page load could get claimed by its own still-installing SW before
  // hydration/i18n-init finished, and lose in-flight preloaded resources to
  // it (the "cross-world service worker resource mismatch" warning). Under
  // 'prompt', a new SW just sits in a waiting state — nothing takes over
  // until updateServiceWorker() below explicitly tells it to — and
  // onNeedRefresh/needRefresh actually fire, which is what this toast reads.
  //
  // `immediate: false` (the Svelte build's own default is `true`, unlike
  // vite-plugin-pwa's generic default of `false` — has to be set explicitly)
  // additionally defers even *registering* the SW until the window `load`
  // event, so it can never race this same page's own initial load at all.
  const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: false });
  function applyUpdate() {
    hapticLight();
    void updateServiceWorker(true);
  }

  // Nothing in this app ever wrapped routed content in an error boundary —
  // an exception thrown while rendering any page (a bad reactive statement,
  // a store read on data that hasn't arrived yet, exactly the stale-chunk
  // class of bug app.html's own script watches for) had nothing to catch
  // it, so the page just went blank with no visible sign anything failed.
  // That's the "splash plays once, then a blank screen" report inside the
  // Telegram Mini App in particular — no devtools there to even see the
  // console error. <svelte:boundary> (stable since Svelte 5.3) catches
  // exactly this class of failure and renders `failed` instead of leaving
  // the DOM half-mounted. Known transient/stale-build errors still
  // self-heal via one silent reload, same signatures app.html's inline
  // script already watches for; anything else shows a real "something
  // broke, tap to reload" screen instead of nothing at all.
  const STALE_BUILD_RELOAD_FLAG = 'yeneeta:stale-chunk-reload';

  // Same reasoning everywhere this appears (app.html's inline copy included):
  // a bare location.reload() can be a no-op, since the reload's own request
  // is still intercepted by whichever service worker's cache is actually the
  // problem. Unregistering first forces this navigation past it, onto the
  // network for real. Used both by the auto-heal path below and by the
  // fallback screen's own manual "Reload" button — that button used to call
  // location.reload() directly, which meant tapping it while stuck behind a
  // broken cached service worker could re-serve the exact same broken page,
  // making the only recovery option a Telegram user has look like it does
  // nothing at all.
  function hardReload(): void {
    if (navigator.serviceWorker?.getRegistrations) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined)
        .then(() => location.reload());
    } else {
      location.reload();
    }
  }

  // Best-effort only: this is what turns "something went wrong, we don't
  // know what" into an actual message/stack an admin can read on the new
  // crash-reports page, instead of guessing at causes from a user's vague
  // description. Raw fetch, not the `api` client — the client's own 401
  // handling, i18n error strings, and auth store are exactly the kind of
  // machinery that might be part of what just crashed, so this must not
  // depend on any of it. Never awaited by the caller and every failure is
  // swallowed: reporting a crash must never itself throw or delay recovery.
  function reportCrash(error: unknown, selfHealed: boolean): void {
    try {
      const platform = document.documentElement.classList.contains('telegram-mini-app')
        ? 'telegram'
        : Capacitor.isNativePlatform()
          ? 'native'
          : 'browser';
      const body = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        url: location.href,
        platform,
        userAgent: navigator.userAgent,
        userId: get(auth).user?.id,
        selfHealed,
      };
      void fetch(`${API_BASE}/diagnostics/client-crash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Never let crash reporting itself become a second crash.
    }
  }

  function handleBoundaryError(error: unknown): void {
    console.error('Caught by root error boundary', error);
    // Every uncaught error this boundary ever sees is, by construction, one
    // this app has no other recovery path for — and inside Telegram
    // specifically there's no devtools and no pull-to-refresh-the-URL-bar
    // trick to fall back on, just this screen. Rather than trying to
    // enumerate every message a stale service worker/cached build could ever
    // throw (the old check here matched five known strings and missed
    // anything not on that list, leaving those stuck on a dead-end screen),
    // treat any first boundary error of the session as worth one automatic
    // clean-reload attempt. The sessionStorage flag makes this fire at most
    // once: a genuinely persistent bug still falls through to the manual
    // "Reload" screen on the second failure, exactly as before.
    try {
      if (sessionStorage.getItem(STALE_BUILD_RELOAD_FLAG)) {
        reportCrash(error, false);
        return;
      }
      sessionStorage.setItem(STALE_BUILD_RELOAD_FLAG, '1');
    } catch {
      // No sessionStorage — fall through and reload anyway.
    }
    reportCrash(error, true);
    hardReload();
  }

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
    // A fresh page load has no access token in memory yet, so this first
    // attempt 401s by design — apiFetch's own refresh-and-retry (in
    // api/client.ts) already handles exactly that using the httpOnly
    // refresh cookie, transparently retrying with the new token. A
    // separate explicit /auth/refresh call here used to run *before* this
    // one and update nothing the store could see yet, so this request
    // still went out tokenless and 401'd anyway — paying for two refresh
    // round-trips (and a confusing 401 in the network tab) to do the work
    // of one. If refreshing genuinely fails, this throws the same
    // ApiError(401) the caller below already knows how to treat as
    // "not signed in."
    const me = await api.get<MeResponse>('/users/me');
    const accessToken = get(auth).accessToken;
    if (!accessToken) throw new ApiError(401, 'Session restore succeeded without an access token');
    if (me.user.preferredLanguage) setLanguage(me.user.preferredLanguage);
    setAuth(accessToken, me.user);
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

    // prepareTelegramMiniApp() already guards every individual bridge call
    // internally — this is just a last-resort net so a future change to it
    // can't reintroduce "one Telegram bridge quirk crashes the entire
    // boot sequence, on the one platform this code even runs on."
    let telegram: ReturnType<typeof prepareTelegramMiniApp> = null;
    try {
      telegram = prepareTelegramMiniApp();
    } catch (error) {
      console.error('prepareTelegramMiniApp failed', error);
    }
    try {
      if (telegram) {
        // Registered once, up front: apiFetch's 401 handler (client.ts)
        // falls back to this whenever the httpOnly refresh cookie is
        // missing/invalid, which happens whenever Telegram's WebView
        // survives a "close and reopen" without persisting it — this
        // re-authenticates from Telegram's own signed initData instead,
        // which needs no cookie/localStorage to have survived at all.
        const telegramWebApp = telegram;
        setTelegramReauth(async () => {
          try {
            const result = await authenticateTelegramMiniApp(telegramWebApp);
            if (result.status !== 'authenticated') return false;
            if (result.user.preferredLanguage) setLanguage(result.user.preferredLanguage);
            setAuth(result.accessToken, result.user);
            return true;
          } catch {
            return false;
          }
        });

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

    // Telegram keeps a Mini App's WebView alive across "close and reopen"
    // far more often than it fully reloads it, so onMount above may simply
    // never run again for a returning session. Without this, a token that
    // quietly expired while backgrounded is only discovered the next time
    // some request 401s mid-interaction. Re-validating the instant the Mini
    // App comes back to the foreground means that never becomes visible to
    // the user in the first place — the failed-refresh fallback in
    // client.ts remains the safety net for everything this misses.
    if (telegram) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && get(auth).accessToken) {
          void authenticateTelegramMiniApp(telegram).then((result) => {
            if (result.status === 'authenticated') {
              if (result.user.preferredLanguage) setLanguage(result.user.preferredLanguage);
              setAuth(result.accessToken, result.user);
            }
          }).catch(() => undefined);
        }
      });
    }
  });
</script>

<svelte:boundary onerror={handleBoundaryError}>
  <slot />
  {#if !directDrawRoute}
    <BackExitToast />
    <Banner />
    <ConnectivityGate />
    {#if $needRefresh}
      <div class="update-toast fixed inset-x-0 z-[65] flex justify-center px-4" style="bottom: calc(92px + var(--safe-bottom));" transition:fly={{ y: 40, duration: 220, easing: cubicOut }}>
        <button
          type="button"
          class="tappable pressable flex items-center gap-2.5 rounded-full bg-ink px-4 py-3 text-[13px] font-bold text-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)]"
          on:click={applyUpdate}
        >
          <RefreshCw size={16} />
          {$_('common.updateAvailable')}
        </button>
      </div>
    {/if}
  {/if}

  {#snippet failed(error, reset)}
    <!-- Deliberately plain, hardcoded, bilingual text — no $_()/svelte-i18n
         here. This screen exists to survive exactly the case where the
         app's own reactive/store machinery (i18n included) is what broke;
         a fallback that depends on the same thing that might have just
         failed isn't a fallback. -->
    <div class="fixed inset-0 z-[9998] flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#e9faf3] px-6 text-center">
      <span class="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#d85353] shadow-sm">
        <TriangleAlert size={27} />
      </span>
      <div>
        <h1 class="text-lg font-extrabold text-ink">Something went wrong</h1>
        <p class="mt-1 max-w-xs text-xs text-muted">ችግር ተፈጥሯል — Please try reloading the app.</p>
      </div>
      <button
        type="button"
        class="tappable pressable flex h-12 min-w-44 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-sm font-bold text-white"
        on:click={hardReload}
      >
        <RefreshCw size={16} /> Reload
      </button>
    </div>
  {/snippet}
</svelte:boundary>
