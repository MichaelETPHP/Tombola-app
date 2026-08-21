<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Raffle } from '$lib/schemas/index.js';

  let raffle: Raffle | null = null;
  let loading = true;

  onMount(async () => {
    try {
      const res = await api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, {
        skipAuth: true,
      });
      raffle = res.raffle;
    } catch (err) {
      console.error('Failed to load raffle', err);
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <p class="hint">Loading…</p>
{:else if !raffle}
  <p class="hint">Raffle not found.</p>
{:else}
  <div class="header">
    <h1>{raffle.title}</h1>
    <StatusBadge status={raffle.status} />
  </div>

  <div class="grid">
    <div class="panel">
      <h2>Details</h2>
      <dl>
        <dt>Prize</dt>
        <dd>{raffle.prizeName} · {raffle.prizeValue} ETB</dd>
        <dt>Ticket price</dt>
        <dd>{raffle.ticketPrice} ETB</dd>
        <dt>Tickets sold</dt>
        <dd>{raffle.ticketsSold} / {raffle.ticketCap}</dd>
        <dt>Max per user</dt>
        <dd>{raffle.maxTicketsPerUser}</dd>
        <dt>Deadline</dt>
        <dd>{new Date(raffle.currentDeadline).toLocaleString()}</dd>
        <dt>Created</dt>
        <dd>{new Date(raffle.createdAt).toLocaleString()}</dd>
      </dl>
      {#if raffle.description}
        <p class="description">{raffle.description}</p>
      {/if}
    </div>

    <div class="panel">
      <h2>Manual controls</h2>
      <p class="hint">
        The API doesn't expose lock/extend/cancel endpoints yet — only the
        background jobs in <code>api/src/jobs</code> transition raffle state
        automatically. Add admin mutation endpoints here once they exist.
      </p>
    </div>
  </div>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    margin-bottom: var(--space-24);
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
  }

  h2 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: var(--space-16);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-20);
  }

  .panel {
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-20);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-8) var(--space-16);
    font-size: 14px;
  }

  dt {
    color: var(--color-text-secondary);
  }

  dd {
    font-weight: 600;
  }

  .description {
    margin-top: var(--space-16);
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .hint code {
    font-family: monospace;
  }
</style>
