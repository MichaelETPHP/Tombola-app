<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { Trophy } from 'lucide-svelte';
  import { payouts as payoutsStore, type Payout } from '$lib/stores/wins.store.js';

  const pullRefresh = getPullRefreshContext();

  // Seeded from the session cache — same reasoning as the Tickets page.
  let payouts: Payout[] = get(payoutsStore);
  let loading = payouts.length === 0;
  let hasFetched = false;

  const statusLabels: Record<Payout['status'], string> = {
    pending_claim: 'Claim your prize',
    id_submitted: 'Claim under review',
    verified: 'Verified — preparing delivery',
    fulfilled: 'Delivered',
    expired: 'Claim window expired',
    rejected: 'Claim rejected',
  };

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login?returnTo=/wins', { replaceState: true });
  }

  async function loadWins() {
    if (payouts.length === 0) loading = true;
    try {
      const res = await api.get<{ payouts: Payout[] }>('/payouts/mine');
      payouts = res.payouts;
      payoutsStore.set(res.payouts);
    } catch (err) {
      console.error('Failed to load wins', err);
    } finally {
      loading = false;
    }
  }

  // Reactive rather than onMount — the silent-refresh on app boot can still
  // be in flight when this page mounts, so fetch once auth actually resolves
  // rather than firing immediately with no token.
  $: if ($auth.isAuthenticated && !hasFetched) {
    hasFetched = true;
    loadWins();
  }

  $: pullRefresh.set($auth.isAuthenticated ? loadWins : null);
</script>

{#if $auth.isLoading}
  <div class="flex flex-col gap-3">
    <ListItemSkeleton />
    <ListItemSkeleton />
    <ListItemSkeleton />
  </div>
{:else if $auth.isAuthenticated}
  <div class="flex flex-col gap-4">
    <h1 class="text-[22px] font-extrabold text-ink">My wins</h1>

    {#if loading}
      <div class="flex flex-col gap-3">
        <ListItemSkeleton />
        <ListItemSkeleton />
        <ListItemSkeleton />
      </div>
    {:else if payouts.length === 0}
      <p class="text-[13px] text-muted">No wins yet — keep entering raffles!</p>
    {:else}
      <div class="flex flex-col gap-3">
        {#each payouts as payout (payout.id)}
          <div class="flex items-center gap-4 rounded-card bg-card p-4 shadow-card">
            <Trophy size={24} class="text-gold" />
            <div class="flex flex-col gap-0.5">
              <span class="text-sm font-bold text-ink">{statusLabels[payout.status]}</span>
              {#if payout.status === 'pending_claim'}
                <span class="text-xs text-coral-start">
                  Claim by {new Date(payout.claimDeadline).toLocaleDateString()}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
