<script lang="ts">
  import type { Raffle } from '../stores/raffles.store.js';
  import OddsBadge from './OddsBadge.svelte';

  export let raffle: Raffle;
  /** Tickets the current user owns in this raffle, if known. */
  export let ticketsOwned = 0;

  $: soldPct = raffle.ticketCap > 0 ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
  $: daysLeft = Math.max(
    0,
    Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
</script>

<a href="/raffles/{raffle.id}" class="raffle-card tappable">
  <div class="prize-image" style={raffle.prizeImageUrl ? `background-image: url(${raffle.prizeImageUrl})` : ''}>
    {#if !raffle.prizeImageUrl}
      <span class="placeholder">🎁</span>
    {/if}
  </div>

  <div class="body">
    <div class="top-row">
      <h3>{raffle.title}</h3>
      <span class="price">{raffle.ticketPrice} ETB</span>
    </div>

    <p class="prize-name">{raffle.prizeName}</p>

    <div class="progress-track">
      <div class="progress-fill" style="width: {soldPct}%"></div>
    </div>
    <div class="meta-row">
      <span>{raffle.ticketsSold}/{raffle.ticketCap} tickets</span>
      <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
    </div>

    <OddsBadge {ticketsOwned} ticketsSold={raffle.ticketsSold} />
  </div>
</a>

<style>
  .raffle-card {
    display: flex;
    flex-direction: column;
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
  }

  .prize-image {
    height: 120px;
    background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end));
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder {
    font-size: 32px;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-16);
  }

  .top-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-8);
  }

  h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .price {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-primary-dark);
    white-space: nowrap;
  }

  .prize-name {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .progress-track {
    height: 6px;
    border-radius: 3px;
    background: var(--color-dot-inactive);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--color-text-secondary);
  }
</style>
