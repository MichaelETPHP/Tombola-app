<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.store.js';

  onMount(() => {
    const unsubscribe = auth.subscribe((state) => {
      if (state.isLoading) return;
      goto(state.isAuthenticated ? '/home' : '/login', { replaceState: true });
      unsubscribe();
    });
  });
</script>
