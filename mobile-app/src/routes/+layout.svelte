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
  import { prepareTelegramMiniApp } from '$lib/telegram.js';
  import { pendingTelegramLink } from '$lib/stores/telegram.store.js';
  import type { AuthResponse } from '$lib/schemas/index.js';

  // registerType: 'autoUpdate' — the service worker swaps itself in on the
  // next load once a new version is precached, no user prompt needed.
  useRegisterSW({ immediate: true });

  /**
   * On boot, the access token is gone (it only ever lived in memory).
   * Try to silently mint a new one from the httpOnly refresh cookie so a
   * page reload doesn't force the user to log in again.
   */
  onMount(async () => {
    initBackButtonHandling();
    initLanguage();

    // Safety net: never trap the user behind the splash if the network
    // hangs — force it down after 5s regardless of how the refresh call
    // resolves. Harmless to call hideBootSplash twice.
    const splashSafetyTimer = setTimeout(hideBootSplash, 5000);

    const telegram = prepareTelegramMiniApp();
    try {
      const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, {
        skipAuth: true,
      });
      const me = await api.get<{ user: { id: string; phone: string; fullName: string | null; preferredLanguage?: 'en' | 'am' } }>(
        '/users/me'
      );
      if (me.user.preferredLanguage) setLanguage(me.user.preferredLanguage);
      setAuth(refreshed.accessToken, me.user);
    } catch (refreshError) {
      if (telegram) {
        try {
          const result = await api.post<
            | ({ status: 'authenticated' } & AuthResponse)
            | {
                status: 'phone_required';
                telegramLinkToken: string;
                telegramUser: { fullName: string; username: string | null; photoUrl: string | null };
              }
          >('/auth/telegram/mini-app', { initData: telegram.initData }, { skipAuth: true });

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
        if (!(refreshError instanceof ApiError)) console.error('Session restore failed', refreshError);
        setAuthLoading(false);
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
