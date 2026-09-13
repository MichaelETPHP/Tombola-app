<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { toast } from '$lib/stores/toast.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { toEthiopianDate, toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import {
    ArrowLeft, Clock3, Copy, Loader2, MessageSquareText, Phone,
    RefreshCw, Send, ShieldAlert, Smartphone, Ticket, Trophy,
  } from 'lucide-svelte';

  const userId = $page.params.id;

  interface UserProfile {
    id: string;
    phone: string;
    fullName: string | null;
    authMethod: 'phone_otp' | 'telegram';
    telegramUsername: string | null;
    telegramPhotoUrl: string | null;
    telegramLinkedAt: string | null;
    isSuspended: boolean;
    createdAt: string;
    ticketCount: number;
    totalSpent: number;
    smsCount: number;
    winsCount: number;
    lastLoginAt: string | null;
  }

  interface UserTicket {
    id: string;
    raffleId: string;
    ticketNumber: number;
    ticketCode?: string;
    raffleTitle?: string;
    raffleStatus?: string;
    raffleDeadlineAt?: string;
    ticketPrice?: number;
    purchasedAt: string;
  }

  interface UserPayout {
    id: string;
    raffleTitle: string;
    raffleCode: string;
    prizeName: string | null;
    prizeTier: number | null;
    grossPrizeValue: number;
    netValue: number;
    claimStatus: string;
    fulfillmentStatus: string;
    claimDeadline: string;
    createdAt: string;
  }

  interface SmsLogEntry {
    id: string;
    status: 'success' | 'error';
    event: string;
    senderLabel: string;
    message: string | null;
    error: string | null;
    createdAt: string;
  }

  interface LoginEvent {
    id: string;
    method: 'phone_otp' | 'telegram';
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
  }

  const eventLabels: Record<string, string> = {
    otp: 'Login code',
    ticket_confirmation: 'Ticket purchase',
    trigger_link: 'Draw trigger link',
    draw_invitation: 'Draw invitation',
    representative_invitation: 'Representative invitation',
    bulk_send: 'Admin broadcast',
    admin_direct_send: 'Sent from profile',
    send: 'Message',
  };

  const formatEtb = (n: number) => Number(n).toLocaleString();

  let profile: UserProfile | null = null;
  let profileLoading = true;
  let profileError = false;

  let tickets: UserTicket[] = [];
  let ticketsLoading = true;

  let payouts: UserPayout[] = [];
  let payoutsLoading = true;

  let smsLogs: SmsLogEntry[] = [];
  let smsLoading = true;

  let loginEvents: LoginEvent[] = [];
  let loginsLoading = true;

  let confirmingSuspend = false;
  let updatingSuspend = false;

  let smsMessage = '';
  let sendingSms = false;

  async function loadProfile() {
    profileLoading = true;
    profileError = false;
    try {
      const res = await api.get<{ user: UserProfile }>(`/admin/users/${userId}`);
      profile = res.user;
    } catch {
      profileError = true;
    } finally {
      profileLoading = false;
    }
  }

  async function loadTickets() {
    ticketsLoading = true;
    try {
      const res = await api.get<{ tickets: UserTicket[] }>(`/admin/users/${userId}/tickets`);
      tickets = res.tickets;
    } catch {
      tickets = [];
    } finally {
      ticketsLoading = false;
    }
  }

  async function loadPayouts() {
    payoutsLoading = true;
    try {
      const res = await api.get<{ payouts: UserPayout[] }>(`/admin/users/${userId}/payouts?limit=50`);
      payouts = res.payouts;
    } catch {
      payouts = [];
    } finally {
      payoutsLoading = false;
    }
  }

  async function loadSms() {
    smsLoading = true;
    try {
      const res = await api.get<{ logs: SmsLogEntry[] }>(`/admin/users/${userId}/sms?limit=50`);
      smsLogs = res.logs;
    } catch {
      smsLogs = [];
    } finally {
      smsLoading = false;
    }
  }

  async function loadLogins() {
    loginsLoading = true;
    try {
      const res = await api.get<{ events: LoginEvent[] }>(`/admin/users/${userId}/logins?limit=50`);
      loginEvents = res.events;
    } catch {
      loginEvents = [];
    } finally {
      loginsLoading = false;
    }
  }

  function refreshAll() {
    void loadProfile();
    void loadTickets();
    void loadPayouts();
    void loadSms();
    void loadLogins();
  }

  onMount(refreshAll);

  async function toggleSuspend() {
    if (!profile || updatingSuspend) return;
    updatingSuspend = true;
    try {
      await api.patch(`/admin/users/${userId}/suspend`, { suspended: !profile.isSuspended });
      profile = { ...profile, isSuspended: !profile.isSuspended };
      confirmingSuspend = false;
      toast.success(`${profile.phone} ${profile.isSuspended ? 'suspended' : 'restored'}.`, 'Account Updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? 'Could not update this account.' : 'Network error.', 'Update Failed');
    } finally {
      updatingSuspend = false;
    }
  }

  async function sendMessage() {
    if (!smsMessage.trim() || sendingSms) return;
    sendingSms = true;
    try {
      await api.post(`/admin/users/${userId}/sms`, { message: smsMessage.trim() });
      toast.success('Message sent.', 'SMS Sent');
      smsMessage = '';
      await loadSms();
      if (profile) profile = { ...profile, smsCount: profile.smsCount + 1 };
    } catch (err) {
      toast.error(err instanceof ApiError ? 'SMS send failed.' : 'Network error.', 'Send Failed');
    } finally {
      sendingSms = false;
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`, 'Copied');
    } catch {
      toast.error('Failed to copy.');
    }
  }
</script>

<svelte:head><title>Customer Profile | YeneEta Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <a href="/users" class="inline-flex w-fit items-center gap-2 text-xs font-bold text-muted no-underline hover:text-ink">
    <ArrowLeft size={15} /> Back to users
  </a>

  {#if profileLoading}
    <div class="space-y-4">
      {#each Array(3) as _}<div class="h-20 animate-pulse rounded-card bg-card"></div>{/each}
    </div>
  {:else if profileError || !profile}
    <div class="rounded-card border border-danger/15 bg-danger-bg p-5 text-sm text-danger">
      This user could not be loaded.
      <button type="button" class="ml-2 font-bold underline" on:click={loadProfile}>Try again</button>
    </div>
  {:else}
    <header class="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary-dark">Customer Profile</p>
        <div class="flex flex-wrap items-center gap-2.5">
          <h1 class="text-[26px] font-extrabold tracking-[-0.03em] text-ink">{profile.fullName ?? 'Unnamed customer'}</h1>
          <StatusBadge status={profile.isSuspended ? 'suspended' : 'active'} />
        </div>
        <div class="mt-1.5 flex items-center gap-1.5 font-mono text-sm text-muted">
          <Phone size={13} />
          <span>{profile.phone}</span>
          <button type="button" class="admin-press text-faint hover:text-ink" title="Copy phone" on:click={() => copyText(profile?.phone ?? '', 'Phone')}><Copy size={12} /></button>
        </div>
      </div>
      <button
        type="button"
        class="admin-press inline-flex h-10 items-center gap-2 self-start rounded-button border px-4 text-xs font-bold {profile.isSuspended ? 'border-success/20 bg-success-bg text-success' : 'border-warning/20 bg-warning-bg text-warning'}"
        on:click={() => (confirmingSuspend = true)}
      >
        <ShieldAlert size={14} /> {profile.isSuspended ? 'Restore account' : 'Suspend account'}
      </button>
    </header>

    <!-- ── Stat pills ── -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div class="rounded-button border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-faint"><Ticket size={13} /><span class="text-[10px] font-bold uppercase tracking-wide">Tickets</span></div>
        <p class="mt-1.5 text-lg font-extrabold text-ink">{profile.ticketCount}</p>
      </div>
      <div class="rounded-button border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-faint"><span class="text-[10px] font-bold uppercase tracking-wide">Total spent</span></div>
        <p class="mt-1.5 text-lg font-extrabold text-ink">{formatEtb(profile.totalSpent)} <span class="text-[10px] font-normal text-faint">ETB</span></p>
      </div>
      <div class="rounded-button border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-faint"><MessageSquareText size={13} /><span class="text-[10px] font-bold uppercase tracking-wide">SMS sent</span></div>
        <p class="mt-1.5 text-lg font-extrabold text-ink">{profile.smsCount}</p>
      </div>
      <div class="rounded-button border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-faint"><Trophy size={13} /><span class="text-[10px] font-bold uppercase tracking-wide">Prizes won</span></div>
        <p class="mt-1.5 text-lg font-extrabold text-ink">{profile.winsCount}</p>
      </div>
      <div class="rounded-button border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-faint"><Clock3 size={13} /><span class="text-[10px] font-bold uppercase tracking-wide">Last login</span></div>
        <p class="mt-1.5 text-xs font-bold text-ink">{profile.lastLoginAt ? toEthiopianDate(profile.lastLoginAt) : 'Never recorded'}</p>
      </div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div class="flex flex-col gap-5">
        <!-- ── Raffle participation ── -->
        <section class="rounded-card border border-border bg-card p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-bold text-ink"><Ticket size={15} class="text-primary" /> Raffle participation</h2>
            <button type="button" class="admin-press text-faint hover:text-ink" on:click={loadTickets}><RefreshCw size={13} class={ticketsLoading ? 'animate-spin' : ''} /></button>
          </div>
          {#if ticketsLoading}
            <div class="space-y-2">{#each Array(3) as _}<div class="h-12 animate-pulse rounded-button bg-bg"></div>{/each}</div>
          {:else if tickets.length === 0}
            <p class="py-6 text-center text-xs text-faint">This user hasn't bought any tickets yet.</p>
          {:else}
            <div class="divide-y divide-border">
              {#each tickets as t (t.id)}
                <div class="flex items-center justify-between gap-3 py-3">
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-ink">{t.raffleTitle ?? 'Raffle'}</p>
                    <p class="mt-0.5 font-mono text-[11px] text-muted">{t.ticketCode ?? `#${t.ticketNumber}`}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    {#if t.raffleStatus}<StatusBadge status={t.raffleStatus} />{/if}
                    <span class="text-[11px] text-faint">{toEthiopianDate(t.purchasedAt)}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- ── Prizes & payouts ── -->
        <section class="rounded-card border border-border bg-card p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-bold text-ink"><Trophy size={15} class="text-primary" /> Prizes &amp; payouts</h2>
            <button type="button" class="admin-press text-faint hover:text-ink" on:click={loadPayouts}><RefreshCw size={13} class={payoutsLoading ? 'animate-spin' : ''} /></button>
          </div>
          {#if payoutsLoading}
            <div class="space-y-2">{#each Array(2) as _}<div class="h-14 animate-pulse rounded-button bg-bg"></div>{/each}</div>
          {:else if payouts.length === 0}
            <p class="py-6 text-center text-xs text-faint">No prizes won yet.</p>
          {:else}
            <div class="grid gap-3 sm:grid-cols-2">
              {#each payouts as p (p.id)}
                <div class="rounded-button border border-success/20 bg-success-bg/50 p-3.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-wide text-success">{p.prizeTier ? `Tier ${p.prizeTier}` : 'Prize'}</span>
                    <StatusBadge status={p.claimStatus} />
                  </div>
                  <p class="mt-1.5 truncate text-xs font-bold text-ink">{p.prizeName ?? 'Prize'} · {p.raffleTitle}</p>
                  <p class="mt-1 text-[11px] text-muted">Net {formatEtb(p.netValue)} ETB · {toEthiopianDate(p.createdAt)}</p>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- ── Login activity ── -->
        <section class="rounded-card border border-border bg-card p-5">
          <div class="mb-1 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-bold text-ink"><Smartphone size={15} class="text-primary" /> Login activity</h2>
            <button type="button" class="admin-press text-faint hover:text-ink" on:click={loadLogins}><RefreshCw size={13} class={loginsLoading ? 'animate-spin' : ''} /></button>
          </div>
          <p class="mb-3 text-[11px] text-faint">Only tracks logins from the day this feature shipped onward — earlier activity was never recorded.</p>
          {#if loginsLoading}
            <div class="space-y-2">{#each Array(3) as _}<div class="h-10 animate-pulse rounded-button bg-bg"></div>{/each}</div>
          {:else if loginEvents.length === 0}
            <p class="py-6 text-center text-xs text-faint">No logins recorded yet.</p>
          {:else}
            <div class="divide-y divide-border">
              {#each loginEvents as ev (ev.id)}
                <div class="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-bold {ev.method === 'telegram' ? 'bg-info-bg text-info' : 'bg-primary-bg text-primary-dark'}">
                      {ev.method === 'telegram' ? 'Telegram' : 'Phone OTP'}
                    </span>
                    {#if ev.ipAddress}<span class="font-mono text-[11px] text-faint">{ev.ipAddress}</span>{/if}
                  </div>
                  <span class="text-[11px] text-muted" title={ev.userAgent ?? ''}>{toEthiopianDateTime(ev.createdAt)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </div>

      <aside class="flex flex-col gap-5">
        <!-- ── Send a message ── -->
        <section class="rounded-card border border-border bg-card p-5">
          <h2 class="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Send size={15} class="text-primary" /> Send a message</h2>
          <textarea
            bind:value={smsMessage}
            rows="4"
            maxlength="1000"
            placeholder="Type a message to send directly to this user…"
            class="w-full resize-none rounded-button border border-border bg-bg/40 p-3 text-xs text-ink outline-none focus:border-primary"
          ></textarea>
          <div class="mt-1 text-right text-[10px] text-faint">{smsMessage.length}/1000</div>
          <button
            type="button"
            disabled={sendingSms || !smsMessage.trim()}
            on:click={sendMessage}
            class="admin-press mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-button bg-primary text-xs font-bold text-white disabled:opacity-50"
          >
            {#if sendingSms}<Loader2 size={14} class="animate-spin" />{:else}<Send size={13} />{/if}
            {sendingSms ? 'Sending…' : 'Send message'}
          </button>
        </section>

        <!-- ── Message history ── -->
        <section class="rounded-card border border-border bg-card p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="flex items-center gap-2 text-sm font-bold text-ink"><MessageSquareText size={15} class="text-primary" /> Message history</h2>
            <button type="button" class="admin-press text-faint hover:text-ink" on:click={loadSms}><RefreshCw size={13} class={smsLoading ? 'animate-spin' : ''} /></button>
          </div>
          {#if smsLoading}
            <div class="space-y-2">{#each Array(3) as _}<div class="h-14 animate-pulse rounded-button bg-bg"></div>{/each}</div>
          {:else if smsLogs.length === 0}
            <p class="py-6 text-center text-xs text-faint">No messages sent to this user yet.</p>
          {:else}
            <div class="max-h-[420px] space-y-2.5 overflow-y-auto">
              {#each smsLogs as log (log.id)}
                <div class="rounded-button border border-border/70 bg-bg/40 p-3 text-[11px]">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-ink">{eventLabels[log.event] ?? log.event}</span>
                    <StatusBadge status={log.status === 'success' ? 'delivered' : 'failed'} />
                  </div>
                  <p class="mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-muted">{log.message ?? '—'}</p>
                  {#if log.status === 'error' && log.error}
                    <p class="mt-1 whitespace-pre-wrap break-words text-[10px] font-semibold text-danger">{log.error}</p>
                  {/if}
                  <p class="mt-1.5 font-mono text-[10px] text-faint">{toEthiopianDateTime(log.createdAt)}</p>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </aside>
    </div>
  {/if}
</div>

{#if confirmingSuspend && profile}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[380px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">{profile.isSuspended ? 'Restore this account?' : 'Suspend this account?'}</h2>
      <p class="mt-1.5 text-sm text-muted">
        {profile.isSuspended ? `${profile.phone} will regain access.` : `${profile.phone} will lose access immediately.`}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={updatingSuspend} on:click={() => (confirmingSuspend = false)}>No</button>
        <button
          type="button"
          class="admin-press flex h-10 items-center justify-center gap-1.5 rounded-button px-5 text-xs font-bold text-white disabled:opacity-50 {profile.isSuspended ? 'bg-success' : 'bg-warning'}"
          disabled={updatingSuspend}
          on:click={toggleSuspend}
        >
          {#if updatingSuspend}<Loader2 size={14} class="animate-spin" />{/if} {updatingSuspend ? 'Updating…' : 'Yes'}
        </button>
      </div>
    </div>
  </div>
{/if}
