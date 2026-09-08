<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { restoreAdminSession } from '$lib/api/client.js';
  import { auth, setAuthLoading, getSessionRevision } from '$lib/stores/auth.store.js';
  import { RefreshCw } from 'lucide-svelte';
  import '../app.css';

  let sessionError = false;
  let retrying = false;
  async function restore() {
    if (retrying) return;
    retrying = true;
    sessionError = false;
    const revision = getSessionRevision();
    try {
      await restoreAdminSession();
      setAuthLoading(false);
    } catch {
      if (revision === getSessionRevision()) sessionError = true;
    } finally { retrying = false; }
  }
  onMount(() => { void restore(); });
</script>

{#if sessionError && !$auth.isAuthenticated && $page.url.pathname !== '/login'}
  <main class="flex min-h-dvh items-center justify-center bg-bg p-6">
    <section class="max-w-md rounded-card border border-border bg-card p-8 text-center">
      <h1 class="text-xl font-bold text-ink">Unable to restore your session</h1>
      <p class="mt-3 text-sm leading-6 text-muted">Check your connection and retry to return to the dashboard.</p>
      <button type="button" disabled={retrying} on:click={restore} class="admin-press mt-6 inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-5 font-bold text-white disabled:opacity-60"><RefreshCw size={16} /> Retry connection</button>
      <a href="/login" class="mt-5 block text-sm text-primary-dark underline">Return to sign in</a>
    </section>
  </main>
{:else}
  <slot />
{/if}
