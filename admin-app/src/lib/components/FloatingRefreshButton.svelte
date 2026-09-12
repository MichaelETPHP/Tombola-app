<script lang="ts">
  import { RefreshCw } from 'lucide-svelte';

  // Every dashboard page had its own bespoke refresh button (or none at
  // all) in a different spot on the page — some in a header, some
  // nowhere. One fixed control in the same corner everywhere means "how
  // do I force this to update" has exactly one answer, regardless of
  // which page you're on. A full reload rather than some per-page
  // in-place refetch is deliberate: it's the one action that's always
  // correct no matter what a given page's own data-loading looks like.
  let refreshing = false;

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  }
</script>

<button
  type="button"
  on:click={refresh}
  disabled={refreshing}
  aria-label="Refresh page"
  title="Refresh page"
  class="admin-press fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-ink shadow-[0_8px_24px_rgba(23,32,30,0.18)] transition-colors hover:border-primary/40 hover:text-primary-dark disabled:cursor-wait"
>
  <RefreshCw size={19} class={refreshing ? 'animate-spin' : ''} />
</button>
