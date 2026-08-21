<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.store.js';
  import Sidebar from '$lib/components/Sidebar.svelte';

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login', { replaceState: true });
  }
</script>

{#if $auth.isLoading}
  <div class="loading">Loading…</div>
{:else if $auth.isAuthenticated}
  <div class="shell">
    <Sidebar />
    <main class="content">
      <slot />
    </main>
  </div>
{/if}

<style>
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .shell {
    display: flex;
    min-height: 100vh;
  }

  .content {
    flex: 1;
    padding: var(--space-32);
    max-width: 1100px;
  }
</style>
