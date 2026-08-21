<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.store.js';
  import BottomNav from '$lib/components/BottomNav.svelte';

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login', { replaceState: true });
  }
</script>

{#if $auth.isLoading}
  <div class="loading">Loading…</div>
{:else if $auth.isAuthenticated}
  <main class="app-content safe-area-top">
    <slot />
  </main>
  <BottomNav />
{/if}

<style>
  .loading {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .app-content {
    padding: var(--space-20) var(--space-16) 100px;
    min-height: 100dvh;
  }
</style>
