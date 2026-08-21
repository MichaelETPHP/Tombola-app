<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { raffles, isLoadingRaffles, type Raffle } from '$lib/stores/raffles.store.js';
  import { api } from '$lib/api/client.js';
  import StatCard from '$lib/components/StatCard.svelte';
  import RaffleCard from '$lib/components/RaffleCard.svelte';

  let ticketCount = 0;
  let winCount = 0;

  onMount(async () => {
    isLoadingRaffles.set(true);
    try {
      const [raffleRes, ticketsRes, payoutsRes] = await Promise.all([
        api.get<{ raffles: Raffle[] }>('/raffles?status=open&limit=10'),
        api.get<{ tickets: unknown[] }>('/tickets'),
        api.get<{ payouts: unknown[] }>('/payouts/mine'),
      ]);
      raffles.set(raffleRes.raffles);
      ticketCount = ticketsRes.tickets.length;
      winCount = payoutsRes.payouts.length;
    } catch (err) {
      console.error('Failed to load home data', err);
    } finally {
      isLoadingRaffles.set(false);
    }
  });

  $: featuredRaffle = $raffles[0];
  $: featuredProgress = featuredRaffle
    ? Math.min(100, (featuredRaffle.ticketsSold / featuredRaffle.ticketCap) * 100)
    : 0;
</script>

<div class="home">
  <header class="greeting">
    <span class="salutation">Welcome back,</span>
    <h1>{$auth.user?.fullName ?? $auth.user?.phone ?? 'friend'}</h1>
  </header>

  <div class="stats-grid">
    <StatCard label="Active tickets" value={ticketCount} accent="tickets" />
    <StatCard label="Raffles won" value={winCount} accent="wins" />
    {#if featuredRaffle}
      <StatCard label="Current raffle" progress={featuredProgress} accent="progress" />
    {/if}
  </div>

  <section class="raffles-section">
    <h2>Open raffles</h2>
    {#if $isLoadingRaffles}
      <p class="hint">Loading raffles…</p>
    {:else if $raffles.length === 0}
      <p class="hint">No open raffles right now — check back soon.</p>
    {:else}
      <div class="raffle-list">
        {#each $raffles as raffle (raffle.id)}
          <RaffleCard {raffle} />
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
  }

  .greeting {
    display: flex;
    flex-direction: column;
  }

  .salutation {
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-secondary);
  }

  .greeting h1 {
    font-size: 22px;
    font-weight: 700;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-12);
  }

  .raffles-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  h2 {
    font-size: 16px;
    font-weight: 700;
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
