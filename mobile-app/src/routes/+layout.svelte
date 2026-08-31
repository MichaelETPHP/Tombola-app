<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, setAuth, setAuthLoading } from '$lib/stores/auth.store.js';
  import { hideBootSplash } from '$lib/native/splash.js';
  import { initBackButtonHandling } from '$lib/native/backButton.js';
  import BackExitToast from '$lib/components/BackExitToast.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import ConnectivityGate from '$lib/components/ConnectivityGate.svelte';
  import '../app.css';
  import { initLanguage, setLanguage } from '$lib/stores/language.store.js';
  import { authenticateTelegramMiniApp, prepareTelegramMiniApp } from '$lib/telegram.js';
  import { pendingTelegramLink } from '$lib/stores/telegram.store.js';

  // registerType: 'autoUpdate' — the service worker swaps itself in on the
  // next load once a new version is precached, no user prompt needed.
  useRegisterSW({ immediate: true });

  /**
   * Telegram Mini Apps always authenticate from Telegram's signed launch
   * data. Native/PWA launches restore the phone session from the refresh
   * cookie. Keeping these paths separate prevents one platform's login
   * method from leaking into the other.
   */
  onMount(async () => {
    initBackButtonHandling();
    initLanguage();

    // Network restoration continues behind precise skeleton states; never
    // hold the native/HTML splash on a slow request.
    const splashSafetyTimer = setTimeout(hideBootSplash, 120);

    const telegram = prepareTelegramMiniApp();
    try {
      if (telegram) {
        try {
          const result = await authenticateTelegramMiniApp(telegram);

          if (result.status === 'authenticated') {
            if (result.user.preferredLanguage) setLanguage(result.user.preferredLanguage);
            setAuth(result.accessToken, result.user);
          } else {
            pendingTelegramLink.set({
              token: result.telegramLinkToken,
              ...result.telegramUser,
            });
            setAuthLoading(false);
            await goto('/login?telegram=link', { replaceState: true });
          }
        } catch (telegramError) {
          console.error('Telegram Mini App login failed', telegramError);
          setAuthLoading(false);
        }
      } else {
        try {
          const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, {
            skipAuth: true,
          });
          const me = await api.get<{
            user: {
              id: string;
              phone: string;
              fullName: string | null;
              preferredLanguage?: 'en' | 'am';
            };
          }>('/users/me');
          if (me.user.preferredLanguage) setLanguage(me.user.preferredLanguage);
          setAuth(refreshed.accessToken, me.user);
        } catch (refreshError) {
          if (!(refreshError instanceof ApiError)) console.error('Session restore failed', refreshError);
          setAuthLoading(false);
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
<BackExitToast />
<Banner />
<ConnectivityGate />
