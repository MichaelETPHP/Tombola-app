<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import { ChevronLeft, ChevronRight, CircleAlert, CreditCard, RefreshCw, Search } from 'lucide-svelte';

  interface ChapaTransaction {
    id: string;
    raffleId: string;
    raffleTitle: string;
    userPhone: string;
    userFullName: string | null;
    amount: number;
    status: 'pending' | 'completed' | 'failed' | 'refunded' | 'review';
    gatewayRef: string | null;
    chapaReference: string | null;
    paymentMethod: string | null;
    createdAt: string;
  }

  type StatusFilter = 'all' | 'success' | 'failed' | 'pending' | 'review';

  const PAGE_SIZE = 25;
  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed / Cancelled' },
    { value: 'pending', label: 'Pending' },
    { value: 'review', label: 'Needs review' },
  ];
  // The DB's own 'completed' is what this page (mirroring Chapa's own
  // dashboard wording) shows as "Success" — never displayed as raw enum text.
  const DISPLAY_STATUS: Record<string, string> = { completed: 'success' };

  let transactions: ChapaTransaction[] = [];
  let total = 0;
  let loading = true;
  let loadError = false;
  let search = '';
  let statusFilter: StatusFilter = 'all';
  let page = 1;
  let searchDebounce: ReturnType<typeof setTimeout>;

  $: totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatEtb = (n: number) => Number(n).toLocaleString();

  const columns = [
    { key: 'status', label: 'Status' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Payment method' },
    { key: 'chapaReference', label: 'Chapa reference' },
    { key: 'merchantReference', label: 'Merchant reference' },
    { key: 'raffle', label: 'Raffle' },
    { key: 'createdAt', label: 'Date' },
  ];

  async function load() {
    loading = true;
    loadError = false;
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        status: statusFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get<{ transactions: ChapaTransaction[]; total: number }>(
        `/admin/payments/chapa-transactions?${params}`
      );
      transactions = res.transactions;
      total = res.total;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(() => clearTimeout(searchDebounce));

  function onSearchInput() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { page = 1; load(); }, 350);
  }

  function setStatusFilter(value: StatusFilter) {
    statusFilter = value;
    page = 1;
    load();
  }

  function goToPage(p: number) {
    page = Math.max(1, Math.min(totalPages, p));
    load();
  }
</script>

<svelte:head><title>Chapa transactions · 251 Lottery Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <header class="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
        <CreditCard size={14} /> Payments
      </div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Chapa transactions</h1>
      <p class="mt-2 max-w-[620px] text-sm leading-relaxed text-muted">
        Every checkout run through Chapa, live from our own records — the same shape as Chapa's own dashboard, with
        the raffle each charge belongs to.
      </p>
    </div>
    <button type="button" class="admin-press flex h-10 shrink-0 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={load}>
      <RefreshCw size={15} /> Refresh
    </button>
  </header>

  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <label class="relative block w-full sm:max-w-[360px]">
      <Search size={16} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <span class="sr-only">Search transactions</span>
      <input bind:value={search} on:input={onSearchInput} type="search" placeholder="Search phone, name, or reference"
        class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary" />
    </label>
    <div class="flex flex-wrap rounded-button border border-border bg-card p-1">
      {#each STATUS_FILTERS as filter (filter.value)}
        <button type="button"
          class="admin-press min-h-9 rounded-[8px] px-3 text-[11px] font-bold {statusFilter === filter.value ? 'bg-primary-bg text-primary-dark' : 'text-muted'}"
          on:click={() => setStatusFilter(filter.value)}>{filter.label}</button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="h-[420px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <section class="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <p class="text-sm font-bold text-ink">Transactions could not be loaded.</p>
      <button type="button" class="admin-press flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={load}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else}
    <DataTable {columns} rows={transactions} emptyMessage="No transactions match this search.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'status'}
          <StatusBadge status={DISPLAY_STATUS[row.status] ?? row.status} />
        {:else if column === 'customer'}
          <span class="font-bold text-ink">{row.userFullName || row.userPhone}</span>
          <p class="mt-0.5 font-mono text-[11px] text-faint">{row.userPhone}</p>
        {:else if column === 'amount'}
          <span class="font-mono font-bold text-ink">{formatEtb(row.amount)} ETB</span>
        {:else if column === 'method'}
          <span class="text-ink">{row.paymentMethod ?? '—'}</span>
        {:else if column === 'chapaReference'}
          <span class="font-mono text-xs text-muted">{row.chapaReference ?? '—'}</span>
        {:else if column === 'merchantReference'}
          <span class="font-mono text-xs text-muted">{row.gatewayRef ?? '—'}</span>
        {:else if column === 'raffle'}
          <span class="text-ink">{row.raffleTitle}</span>
        {:else if column === 'createdAt'}
          <span class="whitespace-nowrap text-muted">{toEthiopianDateTime(row.createdAt)}</span>
        {/if}
      </svelte:fragment>
    </DataTable>

    {#if total > 0}
      <div class="flex flex-col items-center gap-3 rounded-card border border-border bg-card px-4 py-4 sm:flex-row sm:justify-between">
        <p class="text-[11px] text-faint">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} transaction{total !== 1 ? 's' : ''}
        </p>
        {#if totalPages > 1}
          <div class="flex items-center gap-1">
            <button type="button"
              class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border bg-card text-muted disabled:opacity-30"
              disabled={page <= 1} on:click={() => goToPage(page - 1)} aria-label="Previous page">
              <ChevronLeft size={15} />
            </button>
            <span class="px-2 text-[12px] font-bold text-ink">{page} / {totalPages}</span>
            <button type="button"
              class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border bg-card text-muted disabled:opacity-30"
              disabled={page >= totalPages} on:click={() => goToPage(page + 1)} aria-label="Next page">
              <ChevronRight size={15} />
            </button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
