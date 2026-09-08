<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import {
    ChartNoAxesCombined,
    CircleAlert,
    CircleDollarSign,
    RefreshCw,
    Search,
    Ticket,
    Users,
  } from 'lucide-svelte';

  type ProfitRaffle = {
    id: string;
    title: string;
    publicCode: string;
    status: string;
    ticketPrice: number;
    ticketCap: number;
    collectedAmount: number;
    paidTickets: number;
    payingUsers: number;
    prizeCommitment: number;
    projectedRevenue: number;
    grossProfit: number;
    projectedGrossProfit: number;
    marginPercent: number | null;
  };

  type ProfitOverview = {
    raffles: ProfitRaffle[];
    totals: {
      collectedAmount: number;
      prizeCommitment: number;
      grossProfit: number;
      paidTickets: number;
      payingUsers: number;
    };
    calculatedAt: string;
  };

  let overview: ProfitOverview | null = null;
  let loading = true;
  let refreshing = false;
  let loadError = false;
  let search = '';
  let refreshError = '';
  let permissionDenied = false;
  let disposed = false;
  let inFlight: AbortController | undefined;
  let currentPage = 0;
  const pageSize = 25;

  const money = (value: number) => new Intl.NumberFormat('en-ET', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  const signedMoney = (value: number) => `${value < 0 ? '−' : ''}${money(Math.abs(value))}`;

  $: filteredRaffles = (overview?.raffles ?? []).filter((raffle) =>
    `${raffle.title} ${raffle.publicCode}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  $: visibleRaffles = filteredRaffles.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  $: if (currentPage > 0 && currentPage * pageSize >= filteredRaffles.length) currentPage = 0;

  async function load(background = false) {
    if (inFlight || disposed || $auth.admin?.role !== 'owner') return;
    const request = new AbortController();
    inFlight = request;
    background ? (refreshing = true) : (loading = true);
    loadError = false;
    try {
      const result = await api.get<ProfitOverview>('/admin/profits', { signal: request.signal });
      if (!disposed) { overview = result; refreshError = ''; }
    } catch (error) {
      if (disposed) return;
      if (error instanceof ApiError && error.status === 403) { permissionDenied = true; overview = null; }
      if (!overview) loadError = true;
      refreshError = error instanceof ApiError ? error.message : 'Refresh failed. Check your connection and try again.';
    } finally {
      inFlight = undefined;
      loading = false;
      refreshing = false;
    }
  }

  function refreshWhenVisible() {
    if (document.visibilityState === 'visible' && navigator.onLine) void load(true);
  }

  onMount(() => {
    if ($auth.admin?.role !== 'owner') { permissionDenied = true; loading = false; return; }
    void load();
    const refreshTimer = setInterval(refreshWhenVisible, 15_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    return () => {
      disposed = true;
      inFlight?.abort();
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
    };
  });
</script>

<svelte:head><title>Profit | YeneEta Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 class="text-[30px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[38px]">Raffle profit</h1>
      <p class="mt-2 max-w-[650px] text-sm leading-6 text-muted">Completed payments compared with the full prize commitment for every raffle. Figures refresh automatically every 15 seconds.</p>
    </div>
    <button type="button" on:click={() => load(true)} disabled={refreshing || loading || permissionDenied}
      class="admin-press inline-flex h-11 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink disabled:cursor-wait disabled:opacity-60">
      <RefreshCw size={15} class={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing' : 'Refresh now'}
    </button>
  </header>

  {#if permissionDenied}
    <section class="rounded-card border border-border bg-card p-8"><h2 class="text-lg font-bold">Owner access required</h2><p class="mt-2 text-sm text-muted">Profit reporting is available to the platform owner.</p><a href="/raffles" class="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-primary-dark underline">Back to raffles</a></section>
  {:else if loading}
    <div class="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]" aria-label="Loading profit figures">
      <div class="h-64 animate-pulse rounded-card bg-border"></div>
      <div class="h-64 animate-pulse rounded-card bg-border"></div>
    </div>
    <div class="h-96 animate-pulse rounded-card bg-border"></div>
  {:else if loadError || !overview}
    <section class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger"><CircleAlert size={22} /></span>
      <div><h2 class="text-base font-bold text-ink">Profit figures are unavailable</h2><p class="mt-1 text-sm text-muted">Check the API connection, then try again.</p></div>
      <button type="button" class="admin-press inline-flex h-10 items-center gap-2 rounded-button bg-primary px-4 text-xs font-bold text-white" on:click={() => load()}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else}
    {#if refreshError}<div role="status" class="rounded-button bg-warning-bg px-4 py-3 text-sm text-warning">Updates paused. Showing the last successful figures. {refreshError}</div>{/if}
    <div class="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <section class="relative overflow-hidden rounded-card bg-sidebar p-6 text-white shadow-[0_24px_60px_-34px_rgba(23,32,30,0.72)] md:p-8">
        <div class="relative flex min-h-[200px] flex-col justify-between gap-8">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold tracking-[-0.02em]">Current gross position</h2>
              <p class="mt-1 max-w-md text-xs leading-5 text-sidebar-text">Collected revenue minus committed prize value, before Chapa and operating fees.</p>
            </div>
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-primary/15 text-primary"><ChartNoAxesCombined size={19} /></span>
          </div>
          <div>
            <p class="break-words font-sans text-[clamp(1.6rem,3vw,3rem)] font-bold leading-tight tracking-[-0.03em] tabular-nums {overview.totals.grossProfit < 0 ? 'text-[#ffb1b1]' : 'text-white'}">
              {signedMoney(overview.totals.grossProfit)} <span class="text-sm font-medium text-sidebar-text">ETB</span>
            </p>
            <p class="mt-3 text-[11px] text-sidebar-text">Last calculated {new Date(overview.calculatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          </div>
        </div>
      </section>

      <section class="rounded-card border border-border bg-card p-6">
        <h2 class="text-base font-bold tracking-[-0.02em] text-ink">Money received</h2>
        <p class="mt-1 text-xs leading-5 text-muted">Only successful, completed payments.</p>
        <p class="mt-6 font-mono text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums text-primary-dark">{money(overview.totals.collectedAmount)} <span class="text-xs font-medium text-muted">ETB</span></p>
        <dl class="mt-7 grid grid-cols-2 divide-x divide-border border-t border-border pt-5">
          <div class="pr-4"><dt class="flex items-center gap-1.5 text-[10px] font-semibold text-muted"><Ticket size={13} /> Paid tickets</dt><dd class="mt-2 font-mono text-xl font-bold tabular-nums text-ink">{overview.totals.paidTickets.toLocaleString()}</dd></div>
          <div class="pl-4"><dt class="flex items-center gap-1.5 text-[10px] font-semibold text-muted"><Users size={13} /> Buyers</dt><dd class="mt-2 font-mono text-xl font-bold tabular-nums text-ink">{overview.totals.payingUsers.toLocaleString()}</dd></div>
        </dl>
      </section>
    </div>

    <section>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 class="text-lg font-bold tracking-[-0.02em] text-ink">Profit by raffle</h2><p class="mt-1 text-xs text-muted">{filteredRaffles.length} raffle{filteredRaffles.length === 1 ? '' : 's'} shown</p></div>
        <label class="relative block w-full sm:max-w-[300px]">
          <Search size={15} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <span class="sr-only">Search profit by raffle</span>
          <input bind:value={search} on:input={() => currentPage = 0} type="search" placeholder="Search raffle or code" class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] outline-none placeholder:text-faint focus:border-primary" />
        </label>
      </div>

      {#if filteredRaffles.length === 0}
        <div class="rounded-card border border-border bg-card px-6 py-14 text-center"><CircleDollarSign size={24} class="mx-auto text-faint" /><p class="mt-3 text-sm font-bold text-ink">{search ? 'No matching raffles' : 'No raffles to report yet'}</p>{#if search}<button on:click={() => search = ''} class="mt-3 min-h-11 text-sm font-bold text-primary-dark underline">Clear search</button>{:else}<a href="/raffles/new" class="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary-dark underline">Create your first raffle</a>{/if}</div>
      {:else}
        <div class="hidden overflow-x-auto rounded-card border border-border bg-card lg:block">
          <table class="w-full min-w-[960px] border-collapse text-left">
            <thead class="bg-bg/70 text-[10px] font-bold uppercase tracking-[0.08em] text-muted"><tr><th class="px-5 py-4">Raffle</th><th class="px-5 py-4">Paid activity</th><th class="px-5 py-4">Collected</th><th class="px-5 py-4">Prize cost</th><th class="px-5 py-4">Gross position</th><th class="px-5 py-4">Sales</th></tr></thead>
            <tbody>
              {#each visibleRaffles as raffle, index (raffle.id)}
                <tr class="transition-colors hover:bg-bg/60">
                  <td class="px-5 py-4 {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}"><a href="/raffles/{raffle.id}" class="font-bold text-ink no-underline hover:text-primary-dark">{raffle.title}</a><div class="mt-1 flex items-center gap-2"><span class="font-mono text-[10px] text-faint">{raffle.publicCode}</span><StatusBadge status={raffle.status} /></div></td>
                  <td class="px-5 py-4 {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}"><p class="font-mono text-xs font-bold tabular-nums text-ink">{raffle.paidTickets.toLocaleString()} tickets</p><p class="mt-1 text-[10px] text-faint">{raffle.payingUsers.toLocaleString()} paying users</p></td>
                  <td class="px-5 py-4 font-mono text-xs font-bold tabular-nums text-ink {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}">{money(raffle.collectedAmount)} ETB</td>
                  <td class="px-5 py-4 font-mono text-xs font-bold tabular-nums text-ink {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}">{money(raffle.prizeCommitment)} ETB</td>
                  <td class="px-5 py-4 {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}"><p class="font-mono text-xs font-bold tabular-nums {raffle.grossProfit < 0 ? 'text-danger' : 'text-success'}">{signedMoney(raffle.grossProfit)} ETB</p><p class="mt-1 text-[10px] text-faint">{raffle.marginPercent === null ? 'No revenue yet' : `${raffle.marginPercent.toFixed(1)}% margin`}</p></td>
                  <td class="px-5 py-4 {index < filteredRaffles.length - 1 ? 'border-b border-border' : ''}"><div class="w-32"><div class="mb-1.5 flex justify-between font-mono text-[10px]"><span>{raffle.paidTickets}/{raffle.ticketCap}</span><span>{Math.min(100, Math.round((raffle.paidTickets / raffle.ticketCap) * 100))}%</span></div><div class="h-1.5 overflow-hidden rounded-full bg-border"><div class="h-full rounded-full bg-primary" style="width: {Math.min(100, (raffle.paidTickets / raffle.ticketCap) * 100)}%"></div></div></div></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="grid gap-3 lg:hidden">
          {#each visibleRaffles as raffle (raffle.id)}
            <article class="rounded-card border border-border bg-card p-5">
              <div class="flex items-start justify-between gap-3"><div class="min-w-0"><a href="/raffles/{raffle.id}" class="block truncate text-sm font-bold text-ink no-underline">{raffle.title}</a><p class="mt-1 font-mono text-[10px] text-faint">{raffle.publicCode}</p></div><StatusBadge status={raffle.status} /></div>
              <div class="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border py-4">
                <div><p class="text-[10px] text-muted">Users paid</p><p class="mt-1 font-mono text-sm font-bold tabular-nums">{money(raffle.collectedAmount)} ETB</p></div>
                <div><p class="text-[10px] text-muted">Prize commitment</p><p class="mt-1 font-mono text-sm font-bold tabular-nums">{money(raffle.prizeCommitment)} ETB</p></div>
                <div><p class="text-[10px] text-muted">Paid activity</p><p class="mt-1 text-xs font-bold">{raffle.paidTickets} tickets · {raffle.payingUsers} users</p></div>
                <div><p class="text-[10px] text-muted">Gross position</p><p class="mt-1 font-mono text-sm font-bold tabular-nums {raffle.grossProfit < 0 ? 'text-danger' : 'text-success'}">{signedMoney(raffle.grossProfit)} ETB</p></div>
              </div>
              <div class="mt-4"><div class="mb-2 flex justify-between text-[10px] text-muted"><span>Sales progress</span><span class="font-mono font-bold text-ink">{raffle.paidTickets}/{raffle.ticketCap}</span></div><div class="h-1.5 overflow-hidden rounded-full bg-border"><div class="h-full rounded-full bg-primary" style="width: {Math.min(100, (raffle.paidTickets / raffle.ticketCap) * 100)}%"></div></div></div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    {#if filteredRaffles.length > pageSize}
      <nav aria-label="Profit pages" class="flex flex-wrap items-center justify-between gap-3 text-sm"><p>Page {currentPage + 1} of {Math.ceil(filteredRaffles.length / pageSize)}</p><div class="flex gap-2"><button on:click={() => currentPage -= 1} disabled={currentPage === 0} class="min-h-11 rounded-button border border-border bg-card px-4 disabled:opacity-50">Previous</button><button on:click={() => currentPage += 1} disabled={(currentPage + 1) * pageSize >= filteredRaffles.length} class="min-h-11 rounded-button border border-border bg-card px-4 disabled:opacity-50">Next</button></div></nav>
    {/if}
    <p class="flex items-start gap-2 rounded-button bg-primary-bg px-4 py-3 text-sm leading-6 text-primary-dark"><CircleAlert size={16} class="mt-1 shrink-0" /> Figures include every raffle's full prize commitment, including drafts and cancellations. Pending, failed, and refunded payments are excluded from revenue. Fees and operating costs must be deducted separately to calculate net profit.</p>
  {/if}
</div>
