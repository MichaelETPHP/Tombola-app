<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { toast } from '$lib/stores/toast.store.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import PrizeImage from '$lib/components/PrizeImage.svelte';
  import type { Raffle } from '$lib/schemas/index.js';
  import { CircleAlert, Plus, RefreshCw, Search, Ticket, Trash2, Trophy, X } from 'lucide-svelte';

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'locked', label: 'Locked' },
    { value: 'awaiting_trigger', label: 'Awaiting draw' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ] as const;

  type Filter = (typeof filters)[number]['value'];
  let activeStatus: Filter = 'all';
  let raffles: Raffle[] = [];
  let loading = true;
  let loadError = false;
  let search = '';
  let selectedIds = new Set<string>();
  let deletingBulk = false;

  const columns = [
    { key: 'title', label: 'Raffle', sortable: true },
    { key: 'status', label: 'Lifecycle' },
    { key: 'ticketsSold', label: 'Ticket sales', sortable: true },
    { key: 'ticketPrice', label: 'Price' },
    { key: 'currentDeadline', label: 'Deadline', sortable: true },
    { key: 'actions', label: '' },
  ];

  $: filteredRaffles = raffles.filter((raffle) =>
    `${raffle.title} ${raffle.prizeName}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  $: selectedCount = selectedIds.size;
  $: allFilteredSelected = filteredRaffles.length > 0 && filteredRaffles.every((r) => selectedIds.has(r.id));
  $: isOwner = $auth.admin?.role === 'owner';

  async function load(status: Filter = activeStatus) {
    loading = true;
    loadError = false;
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      const res = await api.get<{ raffles: Raffle[] }>(`/admin/raffles${qs}`);
      raffles = res.raffles;
      selectedIds = new Set([...selectedIds].filter((id) => raffles.some((r) => r.id === id)));
    } catch (err) {
      loadError = true;
      console.error('Failed to load raffles', err);
    } finally {
      loading = false;
    }
  }

  function selectStatus(status: Filter) {
    if (status === activeStatus) return;
    activeStatus = status;
    load(status);
  }

  function toggleRow(raffle: Raffle) {
    selectedIds.has(raffle.id) ? selectedIds.delete(raffle.id) : selectedIds.add(raffle.id);
    selectedIds = new Set(selectedIds);
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      filteredRaffles.forEach((r) => selectedIds.delete(r.id));
    } else {
      filteredRaffles.forEach((r) => selectedIds.add(r.id));
    }
    selectedIds = new Set(selectedIds);
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  async function deleteSingleRaffle(raffle: Raffle) {
    if (!confirm(`Permanently delete "${raffle.title}" and all its tickets, prizes, draw results, and payouts? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/raffles/${raffle.id}`);
      raffles = raffles.filter((r) => r.id !== raffle.id);
      selectedIds.delete(raffle.id);
      selectedIds = new Set(selectedIds);
      toast.success(`"${raffle.title}" and all related data deleted.`, 'Raffle Deleted');
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 409
        ? err.message || 'This raffle has a fulfilled payout and cannot be deleted.'
        : 'Delete failed.';
      toast.error(msg, 'Delete Failed');
    }
  }

  async function deleteBulkRaffles() {
    const ids = [...selectedIds];
    if (ids.length === 0 || deletingBulk) return;
    if (!confirm(`Permanently delete ${ids.length} selected raffle${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    deletingBulk = true;
    try {
      const result = await api.delete<{ deletedCount: number; deletedIds: string[]; blockedIds: string[] }>('/admin/raffles', { ids });
      raffles = raffles.filter((r) => !result.deletedIds.includes(r.id));
      clearSelection();
      if (result.blockedIds.length > 0) {
        toast.info(
          `${result.deletedCount} deleted. ${result.blockedIds.length} skipped — they have a fulfilled payout on record.`,
          'Partially Completed'
        );
      } else {
        toast.success(`${result.deletedCount} raffle${result.deletedCount !== 1 ? 's' : ''} deleted successfully.`, 'Bulk Delete Complete');
      }
    } catch {
      toast.error('Bulk delete failed.', 'Delete Failed');
    } finally {
      deletingBulk = false;
    }
  }

  onMount(() => load());
</script>

<svelte:head><title>Raffles | YeneEta Admin</title></svelte:head>

<div class="flex flex-col gap-6">
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark"><Ticket size={14} /> Prize operations</div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Raffles</h1>
      <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">Create prize campaigns and monitor ticket sales through every draw stage.</p>
    </div>
    <a href="/raffles/new" class="admin-press inline-flex h-11 items-center justify-center gap-2 rounded-button bg-primary px-4 text-[13px] font-bold text-white no-underline"><Plus size={16} /> Create raffle</a>
  </header>

  <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
    <div class="flex max-w-full gap-1 overflow-x-auto rounded-button border border-border bg-card p-1">
      {#each filters as filter (filter.value)}
        <button type="button" class="admin-press min-h-9 shrink-0 rounded-[8px] px-3 text-[11px] font-bold {activeStatus === filter.value ? 'bg-primary-bg text-primary-dark' : 'text-muted'}" on:click={() => selectStatus(filter.value)}>{filter.label}</button>
      {/each}
    </div>

    <label class="relative block w-full xl:max-w-[320px]">
      <Search size={15} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <span class="sr-only">Search raffles</span>
      <input bind:value={search} type="search" placeholder="Search raffles" class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] outline-none placeholder:text-faint focus:border-primary" />
    </label>
  </div>

  {#if isOwner && selectedCount > 0}
    <div class="flex items-center justify-between rounded-button border border-primary/20 bg-primary-bg px-4 py-2.5">
      <p class="text-[13px] font-semibold text-primary-dark">
        {selectedCount} of {filteredRaffles.length} raffle{filteredRaffles.length !== 1 ? 's' : ''} selected
      </p>
      <div class="flex items-center gap-2">
        {#if selectedCount < filteredRaffles.length}
          <button type="button" class="admin-press text-[11px] font-bold text-primary-dark underline underline-offset-2" on:click={toggleAllFiltered}>
            Select all {filteredRaffles.length}
          </button>
          <span class="text-primary/40">·</span>
        {/if}
        <button type="button" disabled={deletingBulk}
          class="admin-press inline-flex h-8 items-center gap-1.5 rounded-button border border-danger/25 bg-danger-bg px-3 text-[11px] font-bold text-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          on:click={deleteBulkRaffles}>
          <Trash2 size={12} /> {deletingBulk ? 'Deleting…' : `Delete ${selectedCount}`}
        </button>
        <button type="button" class="admin-press text-[11px] text-muted hover:text-ink" on:click={clearSelection}><X size={14} /></button>
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-between text-[11px] text-muted">
    <p><span class="font-mono font-bold text-ink">{filteredRaffles.length}</span> raffles shown</p>
    <p>Maximum 5 tickets per user</p>
  </div>

  {#if loading}
    <div class="h-[430px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <div><p class="text-sm font-bold text-ink">Raffles could not be loaded</p><p class="mt-1 text-xs text-muted">Check the API connection and try again.</p></div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={() => load()}><RefreshCw size={14} /> Try again</button>
    </div>
  {:else}
    <DataTable
      columns={columns}
      rows={filteredRaffles}
      emptyMessage="No raffles match this view."
      selectable={isOwner}
      isSelected={(row) => selectedIds.has(row.id)}
      allSelected={allFilteredSelected}
      on:toggleRow={(e) => toggleRow(e.detail)}
      on:toggleAll={toggleAllFiltered}
    >
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'title'}
          <a class="group flex items-center gap-3 no-underline" href="/raffles/{row.id}">
            <PrizeImage src={row.prizeImageUrl} icon={Trophy} eager class="h-11 w-11 shrink-0 rounded-[10px] bg-bg ring-1 ring-border" />
            <div class="min-w-0">
              <p class="font-bold text-ink transition-colors group-hover:text-primary-dark">{row.title}</p>
              <p class="mt-1 max-w-[240px] truncate text-[10px] text-faint">{row.prizeName}</p>
            </div>
          </a>
        {:else if column === 'status'}
          <StatusBadge status={row.status} />
        {:else if column === 'ticketsSold'}
          <div class="min-w-[140px]">
            <div class="mb-1.5 flex justify-between text-[10px]"><span class="font-mono font-bold text-ink">{row.ticketsSold}/{row.ticketCap}</span><span class="text-muted">{Math.round((row.ticketsSold / row.ticketCap) * 100)}%</span></div>
            <div class="h-1.5 overflow-hidden rounded-full bg-border"><div class="h-full rounded-full bg-primary" style="width: {Math.min(100, (row.ticketsSold / row.ticketCap) * 100)}%"></div></div>
          </div>
        {:else if column === 'ticketPrice'}
          <span class="font-mono text-xs font-bold">{Number(row.ticketPrice).toLocaleString()} ETB</span>
        {:else if column === 'currentDeadline'}
          <div><p>{new Date(row.currentDeadline).toLocaleDateString()}</p><p class="mt-1 text-[10px] text-faint">{new Date(row.currentDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
        {:else if column === 'actions'}
          {#if isOwner}
            <button type="button" aria-label="Delete raffle" class="admin-press flex h-8 w-8 items-center justify-center rounded-button text-faint hover:bg-danger-bg hover:text-danger" on:click={() => deleteSingleRaffle(row)}>
              <Trash2 size={14} />
            </button>
          {/if}
        {:else}
          {(row as Record<string, unknown>)[column]}
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>
