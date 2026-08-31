<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth, setAuthLoading, clearAuth, type AdminUser } from '$lib/stores/auth.store.js';
  import '../app.css';

  // Silent token refresh via the httpOnly refresh_token cookie, then load
  // the admin's own profile with the freshly-minted access token.
  async function restoreSession(): Promise<void> {
    const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, {
      skipAuth: true,
    });
    const res = await api.get<{ admin: AdminUser }>('/admin/auth/me', {
      headers: {
        Authorization: `Bearer ${refreshed.accessToken}`,
      },
    });
    setAuth(refreshed.accessToken, res.admin);
  }

  onMount(async () => {
    try {
      await restoreSession();
    } catch (err) {
      // A 401 here means the refresh cookie genuinely doesn't represent a
      // valid session (expired, revoked, never existed) — that's a real
      // logout. Anything else (a network blip, a cold-starting container
      // timing out the first request) is transient and does NOT mean the
      // admin is logged out — retrying once before giving up avoids
      // wiping a perfectly valid session just because one request had a
      // bad moment, which is what made this look like a random logout on
      // refresh.
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
      } else {
        console.error('Admin session restore failed, retrying once', err);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
          await restoreSession();
        } catch (retryErr) {
          if (!(retryErr instanceof ApiError && retryErr.status === 401)) {
            console.error('Admin session restore failed on retry', retryErr);
          }
          clearAuth();
        }
      }
    } finally {
      setAuthLoading(false);
    }
  });
</script>

<slot />

