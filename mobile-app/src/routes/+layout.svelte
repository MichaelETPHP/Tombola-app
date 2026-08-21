<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, setAuth, setAuthLoading } from '$lib/stores/auth.store.js';
  import '../app.css';

  /**
   * On boot, the access token is gone (it only ever lived in memory).
   * Try to silently mint a new one from the httpOnly refresh cookie so a
   * page reload doesn't force the user to log in again.
   */
  onMount(async () => {
    try {
      const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, {
        skipAuth: true,
      });
      const me = await api.get<{ user: { id: string; phone: string; fullName: string | null } }>(
        '/users/me'
      );
      setAuth(refreshed.accessToken, me.user);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Session restore failed', err);
      }
      setAuthLoading(false);
    }
  });
</script>

<slot />
