<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Payout } from '$lib/schemas/index.js';

  const statuses = ['all', 'pending_claim', 'claimed', 'verified', 'fulfilled', 'expired', 'rejected'] as const;
  let activeStatus: (typeof statuses)[number] = 'pending_claim';
  let payouts: Payout[] = [];
  let loading = true;

  const columns = [
    { key: 'id', label: 'Payout' },
    { key: 'raffleId', label: 'Raffle' },
    { key: 'status', label: 'Status' },
    { key: 'claimDeadline', label: 'Claim deadline', sortable: true },
  ];

  function isUrgent(deadline: string) {
    return new Date(deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  }

  async function load() {
    loading = true;
    try {
      const qs = activeStatus === 'all' ? '' : `?status=${activeStatus}&limit=100`;
      const res = await api.get<{ payouts: Payout[] }>(`/admin/payouts${qs || '?limit=100'}`);
      payouts = res.payouts;
    } catch (err) {
      console.error('Failed to load payouts', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $: activeStatus, load();
</script>

<h1>Payouts</h1>

<div class="filters">
  {#each statuses as status (status)}
    <button class:active={activeStatus === status} on:click={() => (activeStatus = status)}>
      {status.replace(/_/g, ' ')}
    </button>
  {/each}
</div>

{#if loading}
  <p class="hint">Loading…</p>
{:else}
  <DataTable {columns} rows={payouts} emptyMessage="No payouts in this state.">
    <svelte:fragment slot="cell" let:row let:column>
      {#if column === 'id'}
        <a class="row-link" href="/payouts/{row.id}">{String(row.id).slice(0, 8)}…</a>
      {:else if column === 'status'}
        <StatusBadge status={row.status} />
      {:else if column === 'claimDeadline'}
        <span class:overdue={isUrgent(row.claimDeadline)}>
          {new Date(row.claimDeadline).toLocaleString()}
        </span>
      {:else}
        {(row as Record<string, unknown>)[column]}
      {/if}
    </svelte:fragment>
  </DataTable>
{/if}

<style>
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: var(--space-20);
  }

  .filters {
    display: flex;
    gap: var(--space-8);
    margin-bottom: var(--space-16);
    flex-wrap: wrap;
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

  .overdue {
    color: var(--color-danger);
    font-weight: 600;
  }
</style>
