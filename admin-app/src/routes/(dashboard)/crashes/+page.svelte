<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { api, ApiError } from '$lib/api/client.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import {
    Bug,
    ChevronDown,
    ChevronUp,
    CircleAlert,
    RefreshCw,
    ShieldAlert,
    Smartphone,
    Globe,
    Send as TelegramIcon,
  } from 'lucide-svelte';

  type Platform = 'telegram' | 'native' | 'browser';

  interface CrashEntry {
    id: string;
    message: string;
    stack: string | null;
    url: string | null;
    platform: Platform;
    userAgent: string | null;
    userId: string | null;
    selfHealed: boolean;
    createdAt: string;
  }

  interface CrashStats {
    total: number;
    last24h: number;
    telegram: number;
  }

  const platformIcons: Record<Platform, typeof Globe> = {
    telegram: TelegramIcon,
    native: Smartphone,
    browser: Globe,
  };

  let stats: CrashStats | null = null;
  let statsLoading = true;

  let logs: CrashEntry[] = [];
  let logsLoading = true;
  let logsError = false;
  let logsLoadingMore = false;
  let nextBefore: string | null = null;
  let platformFilter: Platform | '' = '';
  let expandedId: string | null = null;

  async function loadStats() {
    statsLoading = true;
    try {
      stats = await api.get<CrashStats>('/admin/crashes/stats');
    } catch (err) {
      console.error('Failed to load crash stats', err);
      stats = null;
    } finally {
      statsLoading = false;
    }
  }

  async function loadLogs(reset = true) {
    if (reset) {
      logsLoading = true;
      logs = [];
      nextBefore = null;
    } else {
      logsLoadingMore = true;
    }
    logsError = false;
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (platformFilter) params.set('platform', platformFilter);
      if (!reset && nextBefore) params.set('before', nextBefore);
      const res = await api.get<{ logs: CrashEntry[]; nextBefore: string | null }>(`/admin/crashes?${params}`);
      logs = reset ? res.logs : [...logs, ...res.logs];
      nextBefore = res.nextBefore;
    } catch (err) {
      logsError = err instanceof ApiError;
      if (reset) logs = [];
    } finally {
      logsLoading = false;
      logsLoadingMore = false;
    }
  }

  function applyFilters() {
    void loadLogs(true);
  }

  function refreshAll() {
    void loadStats();
    void loadLogs(true);
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  onMount(refreshAll);
</script>

<svelte:head><title>Crash reports · YeneEta Admin</title></svelte:head>

{#if $auth.admin?.role !== 'owner'}
  <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
    <CircleAlert size={24} class="text-danger" />
    <div>
      <p class="text-sm font-bold text-ink">Owner access required</p>
      <p class="mt-1 text-xs text-muted">Crash reports are only visible to the platform owner.</p>
    </div>
  </div>
{:else}
  <div class="admin-reveal flex flex-col gap-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Client diagnostics</p>
        <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Crash reports</h1>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Every "Something went wrong" screen the mobile app's error boundary has actually caught — the real
          error message and stack trace, which platform it happened on, and whether it self-healed automatically.
        </p>
      </div>
      <button type="button" class="admin-press flex h-10 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={refreshAll}>
        <RefreshCw size={15} class={logsLoading || statsLoading ? 'animate-spin' : ''} /> Refresh
      </button>
    </header>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-danger-bg text-danger"><Bug size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Total crashes</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.total ?? 0).toLocaleString()}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-warning-bg text-warning"><ShieldAlert size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Last 24h</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.last24h ?? 0).toLocaleString()}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-bg text-primary-dark"><TelegramIcon size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Inside Telegram</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.telegram ?? 0).toLocaleString()}</p></div>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-3 sm:flex-row sm:items-center">
      <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint sm:max-w-[220px]">
        Platform
        <select bind:value={platformFilter} on:change={applyFilters} class="h-10 rounded-button border border-border bg-bg px-3 text-[13px] font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none">
          <option value="">All</option>
          <option value="telegram">Telegram Mini App</option>
          <option value="native">Native app</option>
          <option value="browser">Browser / PWA</option>
        </select>
      </label>
    </div>

    {#if logsLoading}
      <div class="space-y-3 rounded-card border border-border bg-card p-5">{#each Array(6) as _}<div class="h-12 animate-pulse rounded-button bg-bg"></div>{/each}</div>
    {:else if logsError}
      <section class="flex min-h-[310px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
        <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-warning-bg text-warning"><ShieldAlert size={21} /></span>
        <h2 class="text-base font-bold text-ink">Crash reports could not be loaded</h2>
        <p class="mt-2 max-w-md text-sm leading-6 text-muted">Check the API connection and try again.</p>
        <button type="button" class="admin-press mt-5 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={() => loadLogs(true)}><RefreshCw size={14} /> Try again</button>
      </section>
    {:else}
      <div class="flex flex-col gap-3">
        {#if logs.length === 0}
          <div class="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-faint">
            No crashes recorded{platformFilter ? ` on ${platformFilter}` : ''} yet.
          </div>
        {:else}
          {#each logs as log (log.id)}
            {@const PlatformIcon = platformIcons[log.platform]}
            <div class="rounded-card border border-border bg-card">
              <button
                type="button"
                class="flex w-full items-start gap-3 px-5 py-4 text-left"
                on:click={() => toggleExpanded(log.id)}
              >
                <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-danger-bg text-danger"><PlatformIcon size={14} /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="truncate text-[13px] font-bold text-ink">{log.message}</p>
                    {#if log.selfHealed}
                      <span class="whitespace-nowrap rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Self-healed</span>
                    {:else}
                      <span class="whitespace-nowrap rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">User stuck</span>
                    {/if}
                  </div>
                  <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted">
                    <span>{toEthiopianDateTime(log.createdAt)}</span>
                    <span class="capitalize">{log.platform}</span>
                    {#if log.url}<span class="truncate">{log.url}</span>{/if}
                  </p>
                </div>
                <span class="mt-1 shrink-0 text-muted">
                  {#if expandedId === log.id}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
                </span>
              </button>
              {#if expandedId === log.id}
                <div class="border-t border-border px-5 py-4">
                  {#if log.userId}<p class="mb-2 text-[11px] text-muted">User ID: <span class="font-mono text-ink">{log.userId}</span></p>{/if}
                  {#if log.userAgent}<p class="mb-3 text-[11px] text-muted">User agent: <span class="text-ink">{log.userAgent}</span></p>{/if}
                  {#if log.stack}
                    <pre class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-button bg-bg p-3 font-mono text-[11px] leading-relaxed text-ink">{log.stack}</pre>
                  {:else}
                    <p class="text-[11px] text-faint">No stack trace was captured for this crash.</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      {#if nextBefore}
        <button
          type="button"
          class="admin-press mx-auto flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink disabled:opacity-60"
          disabled={logsLoadingMore}
          on:click={() => loadLogs(false)}
        >
          <RefreshCw size={14} class={logsLoadingMore ? 'animate-spin' : ''} /> Load more
        </button>
      {/if}
    {/if}
  </div>
{/if}
