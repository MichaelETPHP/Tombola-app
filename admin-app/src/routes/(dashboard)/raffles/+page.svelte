<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Raffle } from '$lib/schemas/index.js';

  const statuses = ['all', 'open', 'locked', 'drawing', 'completed', 'cancelled'] as const;
  let activeStatus: (typeof statuses)[number] = 'all';
  let raffles: Raffle[] = [];
  let loading = true;

  const columns = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'status', label: 'Status' },
    { key: 'ticketsSold', label: 'Sold', sortable: true },
    { key: 'ticketCap', label: 'Cap' },
    { key: 'ticketPrice', label: 'Price (ETB)' },
    { key: 'currentDeadline', label: 'Deadline', sortable: true },
  ];

  async function load() {
    loading = true;
    try {
      const qs = activeStatus === 'all' ? '' : `?status=${activeStatus}`;
      const res = await api.get<{ raffles: Raffle[] }>(`/raffles${qs}`, { skipAuth: true });
      raffles = res.raffles;
    } catch (err) {
      console.error('Failed to load raffles', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $: activeStatus, load();
</script>

<div class="header">
  <h1>Raffles</h1>
  <a class="new-btn" href="/raffles/new">+ New raffle</a>
</div>

<div class="filters">
  {#each statuses as status (status)}
    <button class:active={activeStatus === status} on:click={() => (activeStatus = status)}>
      {status}
    </button>
  {/each}
</div>

{#if loading}
  <p class="hint">Loading…</p>
{:else}
  <DataTable {columns} rows={raffles} emptyMessage="No raffles found.">
    <svelte:fragment slot="cell" let:row let:column>
      {#if column === 'title'}
        <a class="row-link" href="/raffles/{row.id}">{row.title}</a>
      {:else if column === 'status'}
        <StatusBadge status={row.status} />
      {:else if column === 'currentDeadline'}
        {new Date(row.currentDeadline).toLocaleString()}
      {:else}
        {(row as Record<string, unknown>)[column]}
      {/if}
    </svelte:fragment>
  </DataTable>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-20);
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
  }

  .new-btn {
    background: var(--color-primary);
    color: #ffffff;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    padding: var(--space-8) var(--space-16);
    border-radius: var(--radius-button);
  }

  .filters {
    display: flex;
    gap: var(--space-8);
    margin-bottom: var(--space-16);
  }

  .filters button {
    border: 1px solid var(--color-border);
    background: var(--color-card-bg);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    padding: var(--space-4) var(--space-12);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }

  .filters button.active {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .row-link {
    font-weight: 600;
    color: var(--color-primary);
    text-decoration: none;
  }
</style>
