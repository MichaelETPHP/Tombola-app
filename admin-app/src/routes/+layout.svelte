<script lang="ts">
  import { onMount } from 'svelte';
  import { setAuthLoading } from '$lib/stores/auth.store.js';
  import '../app.css';

  // Unlike the mobile app, we don't attempt a silent /auth/refresh here:
  // there's no admin login endpoint yet to have set the refresh cookie in
  // the first place (see src/lib/schemas/index.ts). Once admin login lands,
  // mirror mobile-app's root layout and restore the session here too.
  onMount(() => {
    setAuthLoading(false);
  });
</script>

<slot />
