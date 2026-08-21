<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { raffles, isLoadingRaffles, type Raffle } from '$lib/stores/raffles.store.js';
  import RaffleCard from '$lib/components/RaffleCard.svelte';

  const statusFilters = ['open', 'locked', 'completed'] as const;
  let activeFilter: (typeof statusFilters)[number] = 'open';

  async function load() {
    isLoadingRaffles.set(true);
    try {
      const res = await api.get<{ raffles: Raffle[] }>(`/raffles?status=${activeFilter}&limit=50`);
      raffles.set(res.raffles);
    } catch (err) {
      console.error('Failed to load raffles', err);
    } finally {
      isLoadingRaffles.set(false);
    }
  }

  onMount(load);
  $: activeFilter, load();
</script>

<div class="raffles-page">
  <h1>Raffles</h1>

  <div class="filters">
    {#each statusFilters as filter (filter)}
      <button
        class="filter-chip"
        class:active={activeFilter === filter}
        on:click={() => (activeFilter = filter)}
      >
        {filter}
      </button>
    {/each}
  </div>

  {#if $isLoadingRaffles}
    <p class="hint">Loading raffles…</p>
  {:else if $raffles.length === 0}
    <p class="hint">No {activeFilter} raffles right now.</p>
  {:else}
    <div class="raffle-list">
      {#each $raffles as raffle (raffle.id)}
        <RaffleCard {raffle} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .raffles-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .filters {
    display: flex;
    gap: var(--space-8);
  }

  .filter-chip {
    border: none;
    background: var(--color-card-bg);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 600;
    text-transform: capitalize;
    padding: var(--space-8) var(--space-16);
    border-radius: 999px;
    box-shadow: var(--shadow-card-light);
    cursor: pointer;
  }

  .filter-chip.active {
    background: var(--color-primary);
    color: #ffffff;
  }

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .raffle-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }
</style>
