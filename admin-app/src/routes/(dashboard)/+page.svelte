<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import {
    ArrowRight,
    CircleAlert,
    Clock3,
    PackageCheck,
    Plus,
    RefreshCw,
    ShieldCheck,
    Ticket,
    Users,
  } from 'lucide-svelte';

  interface DashboardStats {
    activeRaffles: number;
    openRaffles: number;
    lockedRaffles: number;
    pendingPayouts: number;
    expiringPayouts: { id: string; raffleId: string; claimDeadline: string; status: string }[];
  }

  let stats: DashboardStats | null = null;
  let loading = true;
  let loadError = false;

  async function load() {
    loading = true;
    loadError = false;
    try {
      stats = await api.get<DashboardStats>('/admin/dashboard');
    } catch (err) {
      loadError = true;
      console.error('Failed to load dashboard stats', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  const operations = [
    { href: '/raffles', label: 'Manage raffles', detail: 'Review sales, caps, and draw states', icon: Ticket },
    { href: '/users', label: 'Registered users', detail: 'Review accounts and access status', icon: Users },
    { href: '/payouts', label: 'Payout queue', detail: 'Verify claims and fulfill prizes', icon: PackageCheck },
  ];
</script>

<svelte:head><title>Control Center | Tombola Admin</title></svelte:head>

<div class="flex flex-col gap-7">
  <header class="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
        <ShieldCheck size={14} strokeWidth={2} /> Super Admin workspace
      </div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Control center</h1>
      <p class="mt-2 max-w-[520px] text-sm leading-relaxed text-muted">
        Monitor live raffles, registered users, claims, and the operations that need attention.
      </p>
    </div>
    <a href="/raffles/new" class="admin-press inline-flex h-11 items-center justify-center gap-2 rounded-button bg-primary px-4 text-[13px] font-bold text-white no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
      <Plus size={16} strokeWidth={2.25} /> Create raffle
    </a>
  </header>

  {#if loading}
    <div class="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]" aria-label="Loading dashboard">
      <div class="h-[260px] animate-pulse rounded-card bg-border"></div>
      <div class="h-[260px] animate-pulse rounded-card bg-border"></div>
    </div>
    <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div class="h-[300px] animate-pulse rounded-card bg-border"></div>
      <div class="h-[300px] animate-pulse rounded-card bg-border"></div>
    </div>
  {:else if loadError || !stats}
    <section class="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger"><CircleAlert size={22} /></span>
      <div>
        <h2 class="text-base font-bold text-ink">Dashboard data is unavailable</h2>
        <p class="mt-1 text-sm text-muted">Check the API connection and try again.</p>
      </div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={load}>
        <RefreshCw size={14} /> Try again
      </button>
    </section>
  {:else}
    <div class="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
      <section class="relative min-h-[260px] overflow-hidden rounded-card bg-sidebar p-6 text-white shadow-[0_24px_60px_-32px_rgba(23,32,30,0.65)] md:p-8">
        <div class="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10"></div>
        <div class="absolute -right-6 -top-8 h-40 w-40 rounded-full border border-white/10"></div>
        <div class="relative flex h-full flex-col justify-between gap-8">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Live operations</p>
              <h2 class="mt-3 text-xl font-bold tracking-[-0.025em]">Raffle portfolio</h2>
              <p class="mt-1 max-w-[390px] text-xs leading-relaxed text-sidebar-text">A single view of raffles accepting entries and those preparing for a draw.</p>
            </div>
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-white/10 bg-white/5 text-primary">
              <Ticket size={18} />
            </span>
          </div>

          <div class="grid grid-cols-[1.25fr_0.75fr] divide-x divide-white/10">
            <div class="pr-5">
              <p class="font-mono text-[44px] font-bold leading-none tracking-[-0.06em]">{stats.activeRaffles}</p>
              <p class="mt-2 text-xs font-semibold text-white/75">Active raffles</p>
            </div>
            <div class="pl-5">
              <p class="font-mono text-[30px] font-bold leading-none tracking-[-0.04em] text-primary">{stats.openRaffles}</p>
              <p class="mt-2 text-xs text-sidebar-text">Open now</p>
            </div>
          </div>
        </div>
      </section>

      <section class="flex min-h-[260px] flex-col rounded-card border border-border bg-card p-6 shadow-[0_18px_45px_-32px_rgba(16,124,104,0.4)]">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.13em] text-warning">Needs attention</p>
            <h2 class="mt-2 text-lg font-bold tracking-[-0.02em] text-ink">Operations queue</h2>
          </div>
          <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-warning-bg text-warning"><Clock3 size={18} /></span>
        </div>

        <div class="my-6 flex flex-1 items-center gap-5">
          <div>
            <p class="font-mono text-[38px] font-bold leading-none tracking-[-0.05em] text-ink">{stats.pendingPayouts}</p>
            <p class="mt-2 text-xs text-muted">Claims near deadline</p>
          </div>
          <div class="h-12 w-px bg-border"></div>
          <div>
            <p class="font-mono text-[28px] font-bold leading-none text-warning">{stats.lockedRaffles}</p>
            <p class="mt-2 text-xs text-muted">Locked raffles</p>
          </div>
        </div>

        <a href="/payouts" class="admin-press flex h-10 items-center justify-between rounded-button bg-primary-bg px-3.5 text-xs font-bold text-primary-dark no-underline">
          Review payout queue <ArrowRight size={14} />
        </a>
      </section>
    </div>

    <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <section class="overflow-hidden rounded-card border border-border bg-card">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 class="text-sm font-bold text-ink">Claim deadlines</h2>
            <p class="mt-1 text-[11px] text-muted">Prize claims that require a timely review</p>
          </div>
          <a href="/payouts" class="text-xs font-bold text-primary-dark no-underline">View queue</a>
        </div>

        {#if stats.expiringPayouts.length === 0}
          <div class="flex min-h-[210px] flex-col items-center justify-center gap-3 px-5 py-8 text-center">
            <span class="flex h-11 w-11 items-center justify-center rounded-full bg-success-bg text-success"><ShieldCheck size={19} /></span>
            <div>
              <p class="text-sm font-bold text-ink">No urgent claims</p>
              <p class="mt-1 text-xs text-muted">Nothing is approaching its deadline.</p>
            </div>
          </div>
        {:else}
          <div class="divide-y divide-border">
            {#each stats.expiringPayouts.slice(0, 5) as payout (payout.id)}
              <a href="/payouts/{payout.id}" class="admin-press grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 no-underline hover:bg-bg">
                <div class="min-w-0">
                  <p class="truncate font-mono text-xs font-semibold text-ink">{payout.raffleId}</p>
                  <p class="mt-1 text-[11px] text-muted">Due {new Date(payout.claimDeadline).toLocaleString()}</p>
                </div>
                <StatusBadge status={payout.status} />
              </a>
            {/each}
          </div>
        {/if}
      </section>

      <section class="rounded-card border border-border bg-card p-5">
        <div class="mb-4">
          <h2 class="text-sm font-bold text-ink">Manage platform</h2>
          <p class="mt-1 text-[11px] text-muted">Move directly into an operational workspace</p>
        </div>
        <div class="divide-y divide-border border-y border-border">
          {#each operations as operation (operation.href)}
            <a href={operation.href} class="admin-press grid grid-cols-[36px_1fr_auto] items-center gap-3 py-4 no-underline hover:px-2">
              <span class="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary-bg text-primary-dark">
                <svelte:component this={operation.icon} size={16} strokeWidth={2} />
              </span>
              <div>
                <p class="text-xs font-bold text-ink">{operation.label}</p>
                <p class="mt-1 text-[10px] text-muted">{operation.detail}</p>
              </div>
              <ArrowRight size={15} class="text-faint" />
            </a>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
