<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth, setAuthLoading, clearAuth, type AdminUser } from '$lib/stores/auth.store.js';
  import '../app.css';

  onMount(async () => {
    try {
      // 1. Silent token refresh via httpOnly refresh_token cookie
      const refreshed = await api.post<{ accessToken: string }>('/auth/refresh', undefined, {
        skipAuth: true,
      });

      // 2. Fetch admin user profile using the refreshed accessToken
      const res = await api.get<{ admin: AdminUser }>('/admin/auth/me', {
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
        },
      });

      setAuth(refreshed.accessToken, res.admin);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error('Admin session restore failed', err);
      }
      clearAuth();
    } finally {
      setAuthLoading(false);
    }
  });
</script>

<slot />

