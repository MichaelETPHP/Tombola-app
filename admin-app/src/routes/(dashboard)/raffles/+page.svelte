<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Raffle } from '$lib/schemas/index.js';
  import { CircleAlert, Plus, RefreshCw, Search, Ticket } from 'lucide-svelte';

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

  const columns = [
    { key: 'title', label: 'Raffle', sortable: true },
    { key: 'status', label: 'Lifecycle' },
    { key: 'ticketsSold', label: 'Ticket sales', sortable: true },
    { key: 'ticketPrice', label: 'Price' },
    { key: 'currentDeadline', label: 'Deadline', sortable: true },
  ];

  $: filteredRaffles = raffles.filter((raffle) =>
    `${raffle.title} ${raffle.prizeName}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function load(status: Filter = activeStatus) {
    loading = true;
    loadError = false;
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      const res = await api.get<{ raffles: Raffle[] }>(`/admin/raffles${qs}`);
      raffles = res.raffles;
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

  onMount(() => load());
</script>

<svelte:head><title>Raffles | Tombola Admin</title></svelte:head>

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
    <DataTable columns={columns} rows={filteredRaffles} emptyMessage="No raffles match this view.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'title'}
          <a class="group block no-underline" href="/raffles/{row.id}">
            <p class="font-bold text-ink transition-colors group-hover:text-primary-dark">{row.title}</p>
            <p class="mt-1 max-w-[280px] truncate text-[10px] text-faint">{row.prizeName}</p>
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
        {:else}
          {(row as Record<string, unknown>)[column]}
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>
