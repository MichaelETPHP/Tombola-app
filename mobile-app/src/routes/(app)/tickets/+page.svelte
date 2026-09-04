<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import TicketReceipt from '$lib/components/TicketReceipt.svelte';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { fly, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { ChevronLeft, ChevronDown, Ticket as TicketIcon } from 'lucide-svelte';
  import { tickets as ticketsStore, type Ticket } from '$lib/stores/tickets.store.js';

  const pullRefresh = getPullRefreshContext();

  // Seeded from the session cache — same reasoning as Rooms/Payments.
  let tickets: Ticket[] = get(ticketsStore);
  let loading = tickets.length === 0;
  let hasFetched = false;
  let expandedRaffleId: string | null = null;

  type RaffleGroup = { raffleId: string; raffleTitle: string; tickets: Ticket[] };

  // One row per raffle rather than one per ticket — someone who bought 5
  // tickets for the same raffle sees one group of 5, not 5 separate rows.
  $: groups = Object.values(
    tickets.reduce<Record<string, RaffleGroup>>((acc, t) => {
      if (!acc[t.raffleId]) acc[t.raffleId] = { raffleId: t.raffleId, raffleTitle: t.raffleTitle ?? 'Raffle', tickets: [] };
      acc[t.raffleId].tickets.push(t);
      return acc;
    }, {})
  );

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

  // Reactive rather than onMount — the root layout's silent-refresh can
  // still be in flight when this page mounts.
  $: if ($auth.isAuthenticated && !hasFetched) {
    hasFetched = true;
    loadTickets();
  }

  $: pullRefresh.set($auth.isAuthenticated ? loadTickets : null);

  function toggleRaffle(id: string) {
    hapticLight();
    expandedRaffleId = expandedRaffleId === id ? null : id;
  }
</script>

<svelte:head><title>My Tickets · YeneEta</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="flex items-center gap-3">
    <button
      type="button"
      aria-label="Back to profile"
      on:click={() => {
        hapticLight();
        goto('/profile');
      }}
      class="tappable pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
    >
      <ChevronLeft size={20} />
    </button>
    <h1 class="font-display text-2xl font-semibold text-ink">My Tickets</h1>
  </div>

  {#if loading}
    <div class="flex flex-col gap-3">
      <ListItemSkeleton />
      <ListItemSkeleton />
      <ListItemSkeleton />
    </div>
  {:else if groups.length === 0}
    <div class="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-card-light">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <TicketIcon size={22} />
      </span>
      <p class="text-sm font-semibold text-ink">No tickets yet</p>
      <p class="text-[13px] leading-relaxed text-muted">
        Buy a ticket for any raffle and it shows up here with its receipt.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each groups as group, i (group.raffleId)}
        {@const expanded = expandedRaffleId === group.raffleId}
        <div
          class="overflow-hidden rounded-card bg-card shadow-card-light"
          in:fly={{ y: 10, duration: 220, delay: i * 30, easing: cubicOut }}
          animate:flip={{ duration: 260, easing: cubicOut }}
        >
          <button
            type="button"
            on:click={() => toggleRaffle(group.raffleId)}
            aria-expanded={expanded}
            class="tappable flex w-full items-center gap-3 p-4 text-left"
          >
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
              <TicketIcon size={19} />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink">{group.raffleTitle}</p>
              <p class="mt-0.5 text-xs text-muted">{group.tickets.length} ticket{group.tickets.length === 1 ? '' : 's'}</p>
            </div>
            <ChevronDown
              size={16}
              class="shrink-0 text-muted transition-transform duration-200 ease-[var(--ease-out)] {expanded ? 'rotate-180' : ''}"
            />
          </button>
          {#if expanded}
            <div transition:slide={{ duration: 220, easing: cubicOut }}>
              <div class="flex flex-col gap-3 border-t border-dot-inactive/60 p-4 pt-3.5">
                {#each group.tickets as ticket (ticket.id)}
                  <TicketReceipt
                    raffleTitle={group.raffleTitle}
                    ticketCode={ticket.ticketCode ?? `#${ticket.ticketNumber}`}
                    ticketNumber={ticket.ticketNumber}
                    amount={ticket.amount ?? 0}
                    purchasedAt={ticket.createdAt}
                    expiresAt={ticket.expiresAt}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
