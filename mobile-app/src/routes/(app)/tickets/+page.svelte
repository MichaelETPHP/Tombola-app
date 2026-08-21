<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';

  interface Ticket {
    id: string;
    raffleId: string;
    ticketNumber: number;
    createdAt: string;
  }

  let tickets: Ticket[] = [];
  let loading = true;

  onMount(async () => {
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/tickets');
      tickets = res.tickets;
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      loading = false;
    }
  });
</script>

<div class="tickets-page">
  <h1>My tickets</h1>

  {#if loading}
    <p class="hint">Loading…</p>
  {:else if tickets.length === 0}
    <p class="hint">You haven't bought any tickets yet.</p>
  {:else}
    <div class="list">
      {#each tickets as ticket (ticket.id)}
        <a href="/raffles/{ticket.raffleId}" class="ticket-row tappable">
          <span class="number">#{ticket.ticketNumber}</span>
          <span class="date">{new Date(ticket.createdAt).toLocaleDateString()}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tickets-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .ticket-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-card-bg);
    border-radius: var(--radius-button);
    box-shadow: var(--shadow-card-light);
    padding: var(--space-12) var(--space-16);
    text-decoration: none;
    color: inherit;
  }

  .number {
    font-weight: 700;
    color: var(--color-primary-dark);
  }

  .date {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
</style>
