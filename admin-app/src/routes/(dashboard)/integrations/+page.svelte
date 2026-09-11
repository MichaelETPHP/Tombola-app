<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { api } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import {
    ChevronDown,
    CircleAlert,
    CreditCard,
    Image,
    Info,
    MessageCircle,
    Plug,
    RefreshCw,
    ScrollText,
    Wallet,
  } from 'lucide-svelte';

  type IntegrationMode = 'mock' | 'live' | 'unconfigured' | 'not_implemented';
  type LiveStatus = 'reachable' | 'unreachable' | 'not_applicable';
  type LogStatus = 'success' | 'error';
  type LogIntegration = 'sms' | 'chapa' | 'telegram';

  interface Integration {
    key: string;
    name: string;
    mode: IntegrationMode;
    detail: string;
    live: { status: LiveStatus; message: string; latencyMs?: number; checkedAt: string };
  }

  interface LogEntry {
    id: string;
    integration: LogIntegration;
    status: LogStatus;
    event: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }

  const icons: Record<string, typeof MessageCircle> = {
    otp: MessageCircle,
    chapa: CreditCard,
    storage: Image,
    telebirr: Wallet,
  };

  let integrations: Integration[] = [];
  let loading = true;
  let loadError = false;
  let refreshing = false;

  async function load(showSpinner = true) {
    if (showSpinner) loading = true;
    else refreshing = true;
    loadError = false;
    try {
      const res = await api.get<{ integrations: Integration[] }>('/admin/integrations');
      integrations = res.integrations;
    } catch (err) {
      loadError = true;
      console.error('Failed to load integrations', err);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  // ── Log viewer ──────────────────────────────────────────────────────
  let logs: LogEntry[] = [];
  let logsLoading = true;
  let logsError = false;
  let logsLoadingMore = false;
  let nextBefore: string | null = null;
  let integrationFilter: LogIntegration | '' = '';
  let statusFilter: LogStatus | '' = '';
  let expandedLogId: string | null = null;

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
      if (integrationFilter) params.set('integration', integrationFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && nextBefore) params.set('before', nextBefore);
      const res = await api.get<{ logs: LogEntry[]; nextBefore: string | null }>(`/admin/integrations/logs?${params}`);
      logs = reset ? res.logs : [...logs, ...res.logs];
      nextBefore = res.nextBefore;
    } catch (err) {
      logsError = true;
      console.error('Failed to load integration logs', err);
    } finally {
      logsLoading = false;
      logsLoadingMore = false;
    }
  }

  function applyFilters() {
    void loadLogs(true);
  }

  function toggleExpanded(id: string) {
    expandedLogId = expandedLogId === id ? null : id;
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
  }

  onMount(() => {
    void load();
    void loadLogs();
  });
</script>

<svelte:head><title>Integrations | YeneEta Admin</title></svelte:head>

{#if $auth.admin?.role !== 'owner'}
  <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
    <CircleAlert size={24} class="text-danger" />
    <div>
      <p class="text-sm font-bold text-ink">Owner access required</p>
      <p class="mt-1 text-xs text-muted">Integration status is only visible to the platform owner.</p>
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
          <Plug size={14} /> Platform integrations
        </div>
        <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Integrations</h1>
        <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">
          Status of every external service the platform depends on, including a live reachability check run just now —
          and a log of recent send attempts below. Read-only: real credentials are set as deployment environment
          variables, never through this page.
        </p>
      </div>
      <button
        class="admin-press inline-flex h-10 shrink-0 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold disabled:opacity-60"
        disabled={refreshing || loading}
        on:click={() => load(false)}
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} /> Recheck now
      </button>
    </header>

    {#if loading}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each Array(4) as _}
          <div class="h-44 animate-pulse rounded-card bg-border"></div>
        {/each}
      </div>
    {:else if loadError}
      <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
        <CircleAlert size={24} class="text-danger" />
        <div>
          <p class="text-sm font-bold text-ink">Integrations could not be loaded</p>
          <p class="mt-1 text-xs text-muted">Check the API connection and try again.</p>
        </div>
        <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={() => load()}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each integrations as integration (integration.key)}
          <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
            <div class="flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary-bg text-primary-dark">
                <svelte:component this={icons[integration.key] ?? Plug} size={18} strokeWidth={2} />
              </span>
              <div class="flex flex-col items-end gap-1.5">
                <StatusBadge status={integration.mode} />
                <StatusBadge status={integration.live.status} />
              </div>
            </div>
            <div>
              <p class="text-sm font-bold text-ink">{integration.name}</p>
              <p class="mt-1.5 text-xs leading-relaxed text-muted">{integration.detail}</p>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted">
              <span class="truncate">{integration.live.message}{integration.live.latencyMs !== undefined ? ` · ${integration.live.latencyMs}ms` : ''}</span>
              <span class="shrink-0" title={integration.live.checkedAt}>{new Date(integration.live.checkedAt).toLocaleTimeString('en-GB')}</span>
            </div>
          </div>
        {/each}
      </div>

      <div class="flex items-start gap-3 rounded-card border border-border bg-card p-4">
        <Info size={16} class="mt-0.5 shrink-0 text-primary-dark" />
        <p class="text-xs leading-relaxed text-muted">
          To go live on any of these, set the real credentials as environment variables on the API service in your
          deployment (Coolify, or wherever it's hosted) and flip the matching mock flag off, then redeploy — see
          <code class="rounded bg-border px-1 py-0.5 font-mono text-[11px] text-ink">deploy/COOLIFY.md</code> in the repo.
        </p>
      </div>
    {/if}

    <section class="flex flex-col gap-4 border-t border-border pt-6">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
            <ScrollText size={14} /> Delivery log
          </div>
          <h2 class="text-lg font-extrabold tracking-[-0.02em] text-ink">Recent send attempts</h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="h-9 rounded-button border border-border bg-card px-3 text-xs font-semibold text-ink"
            bind:value={integrationFilter}
            on:change={applyFilters}
          >
            <option value="">All integrations</option>
            <option value="sms">SMS</option>
            <option value="chapa">Chapa</option>
            <option value="telegram">Telegram</option>
          </select>
          <select
            class="h-9 rounded-button border border-border bg-card px-3 text-xs font-semibold text-ink"
            bind:value={statusFilter}
            on:change={applyFilters}
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <button
            class="admin-press inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3 text-xs font-bold disabled:opacity-60"
            disabled={logsLoading}
            on:click={() => loadLogs(true)}
          >
            <RefreshCw size={13} class={logsLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {#if logsLoading}
        <div class="flex flex-col gap-2">
          {#each Array(5) as _}
            <div class="h-12 animate-pulse rounded-button bg-border"></div>
          {/each}
        </div>
      {:else if logsError}
        <div class="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-6 text-center">
          <CircleAlert size={20} class="text-danger" />
          <p class="text-xs text-muted">Log could not be loaded.</p>
          <button class="admin-press inline-flex h-9 items-center gap-2 rounded-button border border-border px-3 text-xs font-bold" on:click={() => loadLogs(true)}>
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      {:else if logs.length === 0}
        <div class="rounded-card border border-border bg-card p-6 text-center text-xs text-muted">
          No {statusFilter || integrationFilter ? 'matching ' : ''}send attempts recorded yet.
        </div>
      {:else}
        <div class="overflow-hidden rounded-card border border-border bg-card">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-border text-[10px] font-bold uppercase tracking-wide text-muted">
                  <th class="px-4 py-2.5">Time</th>
                  <th class="px-4 py-2.5">Integration</th>
                  <th class="px-4 py-2.5">Event</th>
                  <th class="px-4 py-2.5">Status</th>
                  <th class="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {#each logs as log (log.id)}
                  <tr class="border-b border-border last:border-0">
                    <td class="cursor-pointer px-4 py-2.5 align-top font-mono text-[11px] text-muted" on:click={() => toggleExpanded(log.id)}>
                      {formatTime(log.createdAt)}
                    </td>
                    <td class="cursor-pointer px-4 py-2.5 align-top capitalize" on:click={() => toggleExpanded(log.id)}>{log.integration}</td>
                    <td class="cursor-pointer px-4 py-2.5 align-top" on:click={() => toggleExpanded(log.id)}>{log.event.replace(/_/g, ' ')}</td>
                    <td class="cursor-pointer px-4 py-2.5 align-top" on:click={() => toggleExpanded(log.id)}>
                      <StatusBadge status={log.status} />
                      {#if log.status === 'error' && typeof log.detail.error === 'string'}
                        <span class="ml-2 text-[11px] text-danger">{log.detail.error}</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 align-top">
                      <button
                        type="button"
                        class="admin-press flex h-6 w-6 items-center justify-center rounded-full text-muted"
                        aria-label={expandedLogId === log.id ? 'Hide details' : 'Show details'}
                        on:click={() => toggleExpanded(log.id)}
                      >
                        <ChevronDown size={14} class="transition-transform {expandedLogId === log.id ? 'rotate-180' : ''}" />
                      </button>
                    </td>
                  </tr>
                  {#if expandedLogId === log.id}
                    <tr class="border-b border-border bg-app last:border-0">
                      <td colspan="5" class="px-4 py-3">
                        <pre class="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink">{JSON.stringify(log.detail, null, 2)}</pre>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        {#if nextBefore}
          <button
            class="admin-press mx-auto inline-flex h-9 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold disabled:opacity-60"
            disabled={logsLoadingMore}
            on:click={() => loadLogs(false)}
          >
            <RefreshCw size={13} class={logsLoadingMore ? 'animate-spin' : ''} /> Load more
          </button>
        {/if}
      {/if}
    </section>
  </div>
{/if}
