<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import { ChevronLeft, ChevronRight, FileClock, RefreshCw, ShieldAlert } from 'lucide-svelte';

  interface AuditEntry {
    id: string;
    entityType: string;
    entityId: string;
    actorType: 'user' | 'admin' | 'system';
    actorId: string | null;
    action: string;
    createdAt: string;
  }

  let entries: AuditEntry[] = [];
  let entityTypeFilter = '';
  let actorTypeFilter = '';
  let loading = true;
  let unavailable = false;
  let page = 0;
  const pageSize = 25;
  const columns = [
    { key: 'createdAt', label: 'Date & time', sortable: true },
    { key: 'actorType', label: 'Performed by' },
    { key: 'action', label: 'Activity' },
    { key: 'entityType', label: 'Area' },
    { key: 'entityId', label: 'Record' },
  ];

  async function load() {
    loading = true;
    unavailable = false;
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        ...(entityTypeFilter && { entityType: entityTypeFilter }),
        ...(actorTypeFilter && { actorType: actorTypeFilter }),
      });
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit-log?${params}`);
      entries = res.entries;
    } catch (err) {
      unavailable = err instanceof ApiError;
      entries = [];
    } finally {
      loading = false;
    }
  }

  function applyFilters() { page = 0; load(); }
  function changePage(direction: number) { page += direction; load(); }
  onMount(load);
</script>

<svelte:head><title>Audit trail · Tombola Admin</title></svelte:head>

<div class="admin-reveal">
  <header class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Accountability</p>
      <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Audit trail</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">Review important actions taken by administrators, users and automated platform services.</p>
    </div>
    <button type="button" class="admin-press flex h-10 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={load}><RefreshCw size={15} /> Refresh</button>
  </header>

  <div class="mb-5 flex flex-col gap-3 rounded-card border border-border bg-card p-3 sm:flex-row">
    <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">Platform area
      <select bind:value={entityTypeFilter} on:change={applyFilters} class="h-10 rounded-button border border-border bg-bg px-3 text-[13px] font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none">
        <option value="">All areas</option><option value="raffle">Raffles</option><option value="payout">Payouts</option><option value="user">Users</option>
      </select>
    </label>
    <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">Actor
      <select bind:value={actorTypeFilter} on:change={applyFilters} class="h-10 rounded-button border border-border bg-bg px-3 text-[13px] font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none">
        <option value="">Everyone</option><option value="admin">Administrator</option><option value="user">User</option><option value="system">System</option>
      </select>
    </label>
  </div>

  {#if loading}
    <div class="space-y-3 rounded-card border border-border bg-card p-5">{#each Array(6) as _}<div class="h-10 animate-pulse rounded-button bg-bg"></div>{/each}</div>
  {:else if unavailable}
    <section class="flex min-h-[310px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-warning-bg text-warning"><ShieldAlert size={21} /></span>
      <h2 class="text-base font-bold text-ink">Audit service connection required</h2>
      <p class="mt-2 max-w-md text-sm leading-6 text-muted">The database can store audit events, but the admin API does not expose the audit-log route yet. This view will populate when that connection is enabled.</p>
      <button type="button" class="admin-press mt-5 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={load}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else}
    <DataTable {columns} rows={entries} emptyMessage="No activity matches these filters.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'createdAt'}<span class="whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</span>
        {:else if column === 'actorType'}<span class="capitalize">{row.actorType === 'admin' ? 'Administrator' : row.actorType}</span>
        {:else if column === 'entityId'}<span class="font-mono text-[11px] text-faint">{row.entityId.slice(0, 10)}…</span>
        {:else}{(row as unknown as Record<string, unknown>)[column]}{/if}
      </svelte:fragment>
    </DataTable>

    <div class="mt-4 flex items-center justify-between text-xs text-muted">
      <span class="flex items-center gap-2"><FileClock size={14} /> Page {page + 1}</span>
      <div class="flex gap-2">
        <button aria-label="Previous page" class="admin-press flex h-9 w-9 items-center justify-center rounded-button border border-border bg-card disabled:opacity-40" disabled={page === 0} on:click={() => changePage(-1)}><ChevronLeft size={16} /></button>
        <button aria-label="Next page" class="admin-press flex h-9 w-9 items-center justify-center rounded-button border border-border bg-card disabled:opacity-40" disabled={entries.length < pageSize} on:click={() => changePage(1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  {/if}
</div>
