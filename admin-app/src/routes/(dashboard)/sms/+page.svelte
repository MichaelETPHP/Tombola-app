<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store.js';
  import { api, ApiError } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import {
    CircleAlert,
    MessageSquareText,
    PhoneOutgoing,
    RefreshCw,
    Send,
    ShieldAlert,
    UserRound,
  } from 'lucide-svelte';

  type SmsStatus = 'success' | 'error';

  interface SmsLogEntry {
    id: string;
    status: SmsStatus;
    event: string;
    senderLabel: string;
    receiverPhone: string | null;
    receiverName: string | null;
    message: string | null;
    error: string | null;
    createdAt: string;
  }

  interface SmsStats {
    total: number;
    delivered: number;
    failed: number;
    last24h: number;
  }

  const eventLabels: Record<string, string> = {
    otp: 'Login code',
    ticket_confirmation: 'Ticket purchase',
    trigger_link: 'Draw trigger link',
    draw_invitation: 'Draw invitation',
    bulk_send: 'Admin broadcast',
    send: 'Message',
  };

  let stats: SmsStats | null = null;
  let statsLoading = true;

  let logs: SmsLogEntry[] = [];
  let logsLoading = true;
  let logsError = false;
  let logsLoadingMore = false;
  let nextBefore: string | null = null;
  let statusFilter: SmsStatus | '' = '';

  async function loadStats() {
    statsLoading = true;
    try {
      stats = await api.get<SmsStats>('/admin/sms/stats');
    } catch (err) {
      console.error('Failed to load SMS stats', err);
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
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && nextBefore) params.set('before', nextBefore);
      const res = await api.get<{ logs: SmsLogEntry[]; nextBefore: string | null }>(`/admin/sms/logs?${params}`);
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

  onMount(refreshAll);
</script>

<svelte:head><title>SMS log · YeneEta Admin</title></svelte:head>

{#if $auth.admin?.role !== 'owner'}
  <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
    <CircleAlert size={24} class="text-danger" />
    <div>
      <p class="text-sm font-bold text-ink">Owner access required</p>
      <p class="mt-1 text-xs text-muted">The SMS log is only visible to the platform owner.</p>
    </div>
  </div>
{:else}
  <div class="admin-reveal flex flex-col gap-6">
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Delivery record</p>
        <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">SMS log</h1>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Every text this platform has sent — OTP codes, ticket confirmations, draw invitations, and admin
          broadcasts — with who it went to, whether it was delivered, and the exact content sent.
        </p>
      </div>
      <button type="button" class="admin-press flex h-10 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={refreshAll}>
        <RefreshCw size={15} class={logsLoading || statsLoading ? 'animate-spin' : ''} /> Refresh
      </button>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-bg text-primary-dark"><Send size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Total sent</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.total ?? 0).toLocaleString()}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-success-bg text-success"><PhoneOutgoing size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Delivered</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.delivered ?? 0).toLocaleString()}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-danger-bg text-danger"><ShieldAlert size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Failed</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.failed ?? 0).toLocaleString()}</p></div>
      </div>
      <div class="flex items-center gap-3 rounded-card border border-border bg-card p-4">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-warning-bg text-warning"><MessageSquareText size={17} /></span>
        <div><p class="text-[10px] font-bold uppercase tracking-wide text-faint">Last 24h</p><p class="text-xl font-extrabold text-ink">{statsLoading ? '—' : (stats?.last24h ?? 0).toLocaleString()}</p></div>
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-3 sm:flex-row sm:items-center">
      <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint sm:max-w-[220px]">
        Delivery status
        <select bind:value={statusFilter} on:change={applyFilters} class="h-10 rounded-button border border-border bg-bg px-3 text-[13px] font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none">
          <option value="">All</option>
          <option value="success">Delivered</option>
          <option value="error">Failed</option>
        </select>
      </label>
    </div>

    {#if logsLoading}
      <div class="space-y-3 rounded-card border border-border bg-card p-5">{#each Array(6) as _}<div class="h-12 animate-pulse rounded-button bg-bg"></div>{/each}</div>
    {:else if logsError}
      <section class="flex min-h-[310px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
        <span class="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-warning-bg text-warning"><ShieldAlert size={21} /></span>
        <h2 class="text-base font-bold text-ink">SMS log could not be loaded</h2>
        <p class="mt-2 max-w-md text-sm leading-6 text-muted">Check the API connection and try again.</p>
        <button type="button" class="admin-press mt-5 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={() => loadLogs(true)}><RefreshCw size={14} /> Try again</button>
      </section>
    {:else}
      <div class="max-w-full overflow-auto rounded-card border border-border bg-card">
        <table class="w-full min-w-[920px] border-collapse text-sm">
          <thead class="bg-bg/70">
            <tr class="text-left text-[10px] font-bold uppercase tracking-[0.09em] text-muted">
              <th class="whitespace-nowrap border-b border-border px-5 py-3.5">Date &amp; time</th>
              <th class="whitespace-nowrap border-b border-border px-5 py-3.5">Type</th>
              <th class="whitespace-nowrap border-b border-border px-5 py-3.5">Sender</th>
              <th class="whitespace-nowrap border-b border-border px-5 py-3.5">Receiver</th>
              <th class="border-b border-border px-5 py-3.5">Message</th>
              <th class="whitespace-nowrap border-b border-border px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {#if logs.length === 0}
              <tr><td colspan="6" class="px-5 py-12 text-center text-sm text-faint">No {statusFilter ? (statusFilter === 'success' ? 'delivered' : 'failed') : ''} messages recorded yet.</td></tr>
            {:else}
              {#each logs as log (log.id)}
                <tr class="transition-colors duration-200 hover:bg-bg/70">
                  <td class="whitespace-nowrap border-b border-border px-5 py-4 align-top font-mono text-[11px] text-muted">{toEthiopianDateTime(log.createdAt)}</td>
                  <td class="whitespace-nowrap border-b border-border px-5 py-4 align-top text-[13px] text-ink">{eventLabels[log.event] ?? log.event}</td>
                  <td class="whitespace-nowrap border-b border-border px-5 py-4 align-top text-[12px] text-muted">{log.senderLabel}</td>
                  <td class="border-b border-border px-5 py-4 align-top">
                    <p class="whitespace-nowrap font-mono text-[12px] font-semibold text-ink">{log.receiverPhone ?? '—'}</p>
                    {#if log.receiverName}
                      <p class="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] text-muted"><UserRound size={11} /> {log.receiverName}</p>
                    {:else}
                      <p class="mt-0.5 text-[11px] text-faint">Not a registered user</p>
                    {/if}
                  </td>
                  <td class="max-w-[320px] border-b border-border px-5 py-4 align-top text-[12px] leading-relaxed text-ink">
                    <p class="whitespace-pre-wrap break-words">{log.message ?? '—'}</p>
                    {#if log.status === 'error' && log.error}
                      <p class="mt-1.5 whitespace-pre-wrap break-words text-[11px] font-semibold text-danger">{log.error}</p>
                    {/if}
                  </td>
                  <td class="whitespace-nowrap border-b border-border px-5 py-4 align-top">
                    <StatusBadge status={log.status === 'success' ? 'delivered' : 'failed'} />
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
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
