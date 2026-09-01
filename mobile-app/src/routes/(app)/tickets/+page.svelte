<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { tickets as ticketsStore, type Ticket } from '$lib/stores/tickets.store.js';

  const pullRefresh = getPullRefreshContext();

  // Seeded from the session cache so returning to this tab (bottom nav,
  // or back from a raffle) repaints the last-known list instantly instead
  // of a skeleton every time — loadTickets() below still revalidates.
  let tickets: Ticket[] = get(ticketsStore);
  let loading = tickets.length === 0;
  let hasFetched = false;

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login?returnTo=/tickets', { replaceState: true });
  }

  async function loadTickets() {
    if (tickets.length === 0) loading = true;
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/tickets');
      tickets = res.tickets;
      ticketsStore.set(res.tickets);
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      loading = false;
    }
  }

  // Reactive rather than onMount — the silent-refresh on app boot can still
  // be in flight when this page mounts, so fetch once auth actually resolves
  // rather than firing immediately with no token.
  $: if ($auth.isAuthenticated && !hasFetched) {
    hasFetched = true;
    loadTickets();
  }

  $: pullRefresh.set($auth.isAuthenticated ? loadTickets : null);
</script>

{#if $auth.isLoading}
  <div class="flex flex-col gap-3">
    <ListItemSkeleton />
    <ListItemSkeleton />
    <ListItemSkeleton />
  </div>
{:else if $auth.isAuthenticated}
  <div class="flex flex-col gap-4">
    <h1 class="text-[22px] font-extrabold text-ink">My tickets</h1>

    {#if loading}
      <div class="flex flex-col gap-3">
        <ListItemSkeleton />
        <ListItemSkeleton />
        <ListItemSkeleton />
      </div>
    {:else if tickets.length === 0}
      <p class="text-[13px] text-muted">You haven't bought any tickets yet.</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each tickets as ticket (ticket.id)}
          <a
            href="/raffles/{ticket.raffleId}"
            class="tappable flex items-center justify-between rounded-button bg-card px-4 py-3 text-inherit no-underline shadow-card-light"
          >
            <span class="font-mono text-xs font-extrabold text-primary-dark">{ticket.ticketCode ?? `#${ticket.ticketNumber}`}</span>
            <span class="text-xs text-muted">{new Date(ticket.createdAt).toLocaleDateString()}</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>
{/if}
