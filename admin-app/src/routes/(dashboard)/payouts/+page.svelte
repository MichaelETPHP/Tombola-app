<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Payout } from '$lib/schemas/index.js';
  import { CircleAlert, Clock3, PackageCheck, RefreshCw } from 'lucide-svelte';

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'pending_claim', label: 'Awaiting winner' },
    { value: 'id_submitted', label: 'Review ID' },
    { value: 'verified', label: 'Verified' },
    { value: 'fulfilled', label: 'Fulfilled' },
    { value: 'expired', label: 'Expired' },
    { value: 'rejected', label: 'Rejected' },
  ] as const;

  type Filter = (typeof filters)[number]['value'];
  let activeStatus: Filter = 'pending_claim';
  let payouts: Payout[] = [];
  let loading = true;
  let loadError = false;

  const columns = [
    { key: 'id', label: 'Payout reference' },
    { key: 'raffleId', label: 'Raffle' },
    { key: 'status', label: 'Claim status' },
    { key: 'claimDeadline', label: 'Claim deadline', sortable: true },
    { key: 'actions', label: 'Review' },
  ];

  function isUrgent(deadline: string) {
    return new Date(deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  }

  async function load(status: Filter = activeStatus) {
    loading = true;
    loadError = false;
    try {
      const qs = status === 'all' ? '?limit=100' : `?status=${status}&limit=100`;
      const res = await api.get<{ payouts: Payout[] }>(`/admin/payouts${qs}`);
      payouts = res.payouts;
    } catch (err) {
      loadError = true;
      console.error('Failed to load payouts', err);
    } finally {
      loading = false;
    }
  }

  function selectStatus(status: Filter) {
    if (status === activeStatus) return;
    activeStatus = status;
    load(status);
  }

  onMount(() => load());
</script>

<svelte:head><title>Payouts | Tombola Admin</title></svelte:head>

<div class="flex flex-col gap-6">
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark"><PackageCheck size={14} /> Prize fulfillment</div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Payouts</h1>
      <p class="mt-2 max-w-[580px] text-sm leading-relaxed text-muted">Review winner claims, verify identification, and track physical prize fulfillment.</p>
    </div>
    <div class="flex items-center gap-3 rounded-button border border-border bg-card px-4 py-2.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-[10px] bg-warning-bg text-warning"><Clock3 size={15} /></span>
      <div><p class="font-mono text-base font-bold leading-none text-ink">{payouts.length}</p><p class="mt-1 text-[9px] text-muted">In current queue</p></div>
    </div>
  </header>

  <div class="flex max-w-full gap-1 overflow-x-auto rounded-button border border-border bg-card p-1">
    {#each filters as filter (filter.value)}
      <button type="button" class="admin-press min-h-9 shrink-0 rounded-[8px] px-3 text-[11px] font-bold {activeStatus === filter.value ? 'bg-primary-bg text-primary-dark' : 'text-muted'}" on:click={() => selectStatus(filter.value)}>{filter.label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="h-[430px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <div><p class="text-sm font-bold text-ink">Payouts could not be loaded</p><p class="mt-1 text-xs text-muted">Check the API connection and try again.</p></div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={() => load()}><RefreshCw size={14} /> Try again</button>
    </div>
  {:else}
    <DataTable columns={columns} rows={payouts} emptyMessage="No payouts in this queue.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'id'}
          <div><p class="font-mono text-xs font-bold text-ink">{String(row.id).slice(0, 8)}</p><p class="mt-1 text-[9px] text-faint">Prize claim</p></div>
        {:else if column === 'raffleId'}
          <span class="font-mono text-[11px] text-muted">{String(row.raffleId).slice(0, 13)}…</span>
        {:else if column === 'status'}
          <StatusBadge status={row.status} />
        {:else if column === 'claimDeadline'}
          <div class={isUrgent(row.claimDeadline) ? 'text-danger' : ''}>
            <p class="font-semibold">{new Date(row.claimDeadline).toLocaleDateString()}</p>
            <p class="mt-1 text-[10px] opacity-70">{new Date(row.claimDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        {:else if column === 'actions'}
          <a href="/payouts/{row.id}" class="admin-press inline-flex h-9 items-center rounded-button bg-primary-bg px-3 text-[11px] font-bold text-primary-dark no-underline">Review claim</a>
        {:else}
          {(row as Record<string, unknown>)[column]}
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>
