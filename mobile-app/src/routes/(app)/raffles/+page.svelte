<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { raffles, isLoadingRaffles, type Raffle } from '$lib/stores/raffles.store.js';
  import RaffleCard from '$lib/components/RaffleCard.svelte';
  import RaffleCardSkeleton from '$lib/components/RaffleCardSkeleton.svelte';
  import { hapticLight } from '$lib/native/haptics.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { RefreshCw, Ticket } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();

  const filters = [
    { value: 'open', label: 'Open now' },
    { value: 'locked', label: 'Drawing soon' },
    { value: 'completed', label: 'Winners' },
  ] as const;

  type Filter = (typeof filters)[number]['value'];

  let activeFilter: Filter = 'open';
  let loadError = false;

  async function load(filter: Filter = activeFilter) {
    isLoadingRaffles.set(true);
    loadError = false;
    try {
      const res = await api.get<{ raffles: Raffle[] }>(`/raffles?status=${filter}&limit=50`, {
        skipAuth: true,
      });
      raffles.set(res.raffles);
    } catch (err) {
      loadError = true;
      console.error('Failed to load raffles', err);
    } finally {
      isLoadingRaffles.set(false);
    }
  }

  function selectFilter(filter: Filter) {
    if (filter === activeFilter) return;
    hapticLight();
    activeFilter = filter;
    load(filter);
  }

  onMount(() => {
    load();
    // Re-fetches whatever filter tab is active at the moment of the pull,
    // not a fixed one — reads activeFilter through the closure each call.
    pullRefresh.set(() => load());
  });
</script>

<div class="flex flex-col gap-5">
  <header class="flex flex-col gap-1.5">
    <span class="text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary-dark">Choose your chance</span>
    <h1 class="font-sans text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink">Raffles</h1>
    <p class="max-w-[380px] text-[13px] leading-relaxed text-muted">
      Pick a prize and enter with 1–5 tickets. Each ticket counts as one chance.
    </p>
  </header>

  <div class="grid grid-cols-3 rounded-button bg-card/65 p-1 shadow-card-light" role="tablist" aria-label="Raffle status">
    {#each filters as filter (filter.value)}
      <button
        type="button"
        role="tab"
        aria-selected={activeFilter === filter.value}
        class="tappable pressable min-h-11 rounded-[12px] px-2 text-[11px] font-bold transition-[background-color,color,box-shadow] duration-200 {activeFilter === filter.value
          ? 'bg-primary text-[#10211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
          : 'text-muted'}"
        on:click={() => selectFilter(filter.value)}
      >
        {filter.label}
      </button>
    {/each}
  </div>

  {#if $isLoadingRaffles}
    <div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading raffles">
      <RaffleCardSkeleton />
      <RaffleCardSkeleton />
      <RaffleCardSkeleton />
    </div>
  {:else if loadError}
    <div class="flex flex-col items-center gap-3 rounded-card border border-white/70 bg-card px-5 py-8 text-center shadow-card-light">
      <RefreshCw size={24} class="text-primary-dark" />
      <div>
        <p class="text-sm font-bold text-ink">Raffles didn’t load</p>
        <p class="mt-1 text-xs text-muted">Check your connection and try again.</p>
      </div>
      <button
        type="button"
        class="tappable pressable h-11 rounded-button bg-primary px-5 text-xs font-bold text-[#10211d]"
        on:click={() => load()}
      >
        Try again
      </button>
    </div>
  {:else if $raffles.length === 0}
    <div class="flex flex-col items-center gap-3 rounded-card border border-white/70 bg-card px-5 py-9 text-center shadow-card-light">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <Ticket size={22} />
      </span>
      <div>
        <p class="text-sm font-bold text-ink">Nothing here yet</p>
        <p class="mt-1 max-w-[250px] text-xs leading-relaxed text-muted">
          There are no raffles in this stage right now.
        </p>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each $raffles as raffle, i (raffle.id)}
        <RaffleCard {raffle} index={i} eager={i < 2} />
      {/each}
    </div>
  {/if}
</div>
