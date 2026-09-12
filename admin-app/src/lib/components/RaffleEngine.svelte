<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { toEthiopianDate } from '$lib/utils/ethiopianDate.js';
  import {
    Check, Clock3, Fingerprint, Link2, RefreshCw,
    ShieldCheck, Ticket, Users, Search, Copy, Phone, ExternalLink,
    X, Sparkles, AlertCircle, CalendarDays, Trophy
  } from 'lucide-svelte';

  export let raffleId: string;

  type Engine = {
    raffle: {
      id: string;
      title: string;
      code: string;
      status: string;
      ticketsSold: number;
      ticketCap: number;
      drawCommitment: string | null;
      deadlineAt: string;
    };
    prizes: { id: string; tier: number; name: string; value: number; imageUrl: string | null }[];
    participants: {
      id: string;
      fullName: string | null;
      phone: string;
      maskedPhone?: string;
      ticketCount: number;
      firstTicket: number;
      lastTicket: number;
      ticketNumbers: number[];
      lastPurchasedAt: string;
    }[];
    triggers: {
      id: string;
      tier: number;
      attemptNumber: number;
      status: string;
      sentAt: string | null;
      expiresAt: string | null;
      clickedAt: string | null;
      phone: string;
      maskedPhone?: string;
    }[];
    representatives: {
      id: string;
      tier: number;
      attemptNumber: number;
      status: string;
      sentAt: string | null;
      expiresAt: string | null;
      approvedAt: string | null;
      userId: string;
      fullName: string | null;
      phone: string;
      maskedPhone?: string;
    }[];
    extensions: {
      id: string;
      previousDeadline: string;
      newDeadline: string;
      reason: string;
      extendedAt: string;
      ticketsSoldAtExtension: number;
    }[];
    draws: {
      tier: number;
      prizeName: string;
      winningTicketCode: string;
      winnerUserId: string;
      winnerName: string | null;
      winnerPhone: string;
      drawnAt: string;
      finalSeedHash: string;
    }[];
  };

  let engine: Engine | null = null;
  let loading = true;
  let reason = 'Representative assigned by Platform Owner';
  let participantSearch = '';
  let repSearch: Record<number, string> = {};
  let repPickerOpenTier: number | null = null;
  let assigningTier: number | null = null;

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return 'Network error.';
    try {
      const body = JSON.parse(err.body) as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  }

  // 1st, 2nd, 3rd, 4th, 11th, 21st, ...
  function ordinal(n: number): string {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  const ticketCode = (number: number) => `${engine?.raffle.code}-${String(number).padStart(5, '0')}`;

  const prizeLabel = (tier: number) => `${ordinal(tier)} prize`;

  // Which prize tier(s), if any, each participant won — drives the green
  // highlight + medal badge in the Participant Directory below.
  $: winningTiersByUserId = (engine?.draws ?? []).reduce<Record<string, number[]>>((byUser, draw) => {
    (byUser[draw.winnerUserId] ??= []).push(draw.tier);
    return byUser;
  }, {});

  async function load() {
    try {
      const response = await api.get<{ engine: Engine }>(`/admin/raffles/${raffleId}/engine`);
      engine = response.engine;
    } catch {
      toast.error('Could not load the raffle engine details.', 'Error');
    } finally {
      loading = false;
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard!`, 'Copied');
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  }

  // Hand-picked witness for a tier — distinct from the random trigger
  // recipient above. Must hold a ticket in this raffle (server-enforced;
  // this list is already scoped to that, so any pick here is valid) and
  // must approve before that tier's trigger link can be generated.
  function filterParticipants(query: string) {
    if (!engine) return [];
    const q = query.trim().toLowerCase();
    if (!q) return engine.participants;
    return engine.participants.filter((p) =>
      (p.fullName ?? '').toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)
    );
  }

  async function assignRepresentative(tier: number, userId: string) {
    if (!engine || assigningTier !== null) return;
    assigningTier = tier;
    try {
      const isReassign = engine.representatives.some((r) => r.tier === tier);
      const path = isReassign ? 'draw-representative/reassign' : 'draw-representative';
      await api.post(`/admin/raffles/${raffleId}/${path}`, { tier, userId, reason });
      toast.success(`${ordinal(tier)} prize representative assigned — SMS sent for approval.`, 'Representative Assigned');
      repPickerOpenTier = null;
      await load();
    } catch (cause) {
      toast.error(apiErrorMessage(cause, `Could not assign the ${ordinal(tier)} prize representative.`), 'Assignment Failed');
    } finally {
      assigningTier = null;
    }
  }

  // Filter participants by name, unmasked phone, or exact ticket number
  $: filteredParticipants = (engine?.participants ?? []).filter((p) => {
    if (!participantSearch.trim()) return true;
    const q = participantSearch.trim().toLowerCase();
    const nameMatch = (p.fullName ?? '').toLowerCase().includes(q);
    const phoneMatch = p.phone.toLowerCase().includes(q);
    const ticketMatch = (p.ticketNumbers ?? [p.firstTicket]).some((num) =>
      ticketCode(num).toLowerCase().includes(q) || String(num).includes(q)
    );
    return nameMatch || phoneMatch || ticketMatch;
  });

  $: totalTicketsInRoster = (engine?.participants ?? []).reduce((sum, p) => sum + p.ticketCount, 0);

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    void load();
    pollTimer = setInterval(() => void load(), 4000);
  });
  onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<section class="mt-5 rounded-card border border-border bg-card p-5 sm:p-6 shadow-sm">
  <!-- ── Header ── -->
  <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
    <div class="flex gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-bg text-primary shadow-sm">
        <Fingerprint size={22} />
      </span>
      <div>
        <div class="flex items-center gap-2">
          <p class="text-xs font-bold uppercase tracking-[0.14em] text-primary">Raffle Engine Pro</p>
          <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            <Sparkles size={10} /> Live Control
          </span>
        </div>
        <h2 class="mt-1 text-xl font-black tracking-[-0.02em] text-ink">Fair Draw & Participant Command</h2>
        <p class="mt-1 max-w-xl text-xs leading-5 text-faint">
          Monitor ticket distribution, inspect customer contact details, and manage multi-tier community draw representatives.
        </p>
      </div>
    </div>
    <button
      type="button"
      on:click={load}
      class="admin-press flex h-9 items-center gap-2 self-start rounded-button border border-border bg-card px-3 text-xs font-bold text-muted hover:text-ink hover:border-primary/40 transition-colors shadow-xs"
    >
      <RefreshCw size={13} /> Refresh Data
    </button>
  </div>

  {#if loading}
    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      {#each Array(3) as _}
        <div class="h-24 animate-pulse rounded-button bg-bg/80"></div>
      {/each}
    </div>
  {:else if engine}
    <!-- ── Summary Stats ── -->
    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      <div class="rounded-button border border-border/70 bg-bg/50 p-4 transition-all hover:border-primary/30">
        <div class="flex items-center gap-2 text-faint">
          <Ticket size={14} />
          <span class="text-[11px] font-bold uppercase tracking-[0.1em]">Issued Tickets</span>
        </div>
        <p class="mt-2.5 text-2xl font-black tracking-[-0.03em] text-ink">
          {engine.raffle.ticketsSold}
          <span class="text-sm font-medium text-faint">/ {engine.raffle.ticketCap}</span>
        </p>
        <p class="mt-1 font-mono text-xs font-bold text-primary">{engine.raffle.code} Series</p>
      </div>

      <div class="rounded-button border border-border/70 bg-bg/50 p-4 transition-all hover:border-primary/30">
        <div class="flex items-center gap-2 text-faint">
          <Users size={14} />
          <span class="text-[11px] font-bold uppercase tracking-[0.1em]">Total Participants</span>
        </div>
        <p class="mt-2.5 text-2xl font-black tracking-[-0.03em] text-ink">{engine.participants.length}</p>
        <p class="mt-1 text-xs text-faint">
          Avg {(totalTicketsInRoster / Math.max(1, engine.participants.length)).toFixed(1)} tickets / player
        </p>
      </div>

      <div class="rounded-button border border-border/70 bg-bg/50 p-4 transition-all hover:border-primary/30">
        <div class="flex items-center gap-2 text-faint">
          <ShieldCheck size={14} />
          <span class="text-[11px] font-bold uppercase tracking-[0.1em]">Provably-Fair Proof</span>
        </div>
        <p class="mt-2.5 text-sm font-bold text-ink">
          {#if engine.draws.length === engine.prizes.length && engine.prizes.length > 0}
            <span class="text-success flex items-center gap-1.5"><Check size={14} /> All Tiers Finalized</span>
          {:else if engine.draws.length > 0}
            <span class="text-primary">{engine.draws.length} of {engine.prizes.length} Tiers Drawn</span>
          {:else if engine.raffle.drawCommitment}
            <span class="text-info">SHA-256 Committed</span>
          {:else}
            <span class="text-faint">Pre-commitment Ready</span>
          {/if}
        </p>
        <p class="mt-1 truncate font-mono text-[10px] text-faint" title={engine.draws[0]?.finalSeedHash ?? engine.raffle.drawCommitment ?? ''}>
          {engine.draws[0]?.finalSeedHash ?? engine.raffle.drawCommitment ?? 'Commitment pending lock'}
        </p>
      </div>
    </div>

    <!-- ── Finalized Winners Banner (if drawn) ── -->
    {#if engine.draws.length > 0}
      <div class="mt-5">
        <h3 class="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-success"><Trophy size={14} /> Official Draw Winners</h3>
        <div class="grid gap-3 {engine.draws.length > 1 ? 'sm:grid-cols-3' : ''}">
          {#each engine.draws as draw (draw.tier)}
            <div class="flex flex-col justify-between gap-3 rounded-button border border-success/30 bg-success-bg/80 p-4.5 shadow-xs">
              <div>
                <div class="flex items-center justify-between">
                  <span class="rounded-full bg-success/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-success">
                    {ordinal(draw.tier)} Place Winner
                  </span>
                  <ShieldCheck size={17} class="text-success" />
                </div>
                <p class="mt-2 text-xs font-bold text-ink truncate">{draw.prizeName}</p>
                <div class="mt-1.5 flex items-center gap-2">
                  <span class="font-mono text-xl font-black tracking-tight text-ink">{draw.winningTicketCode}</span>
                  <button
                    type="button"
                    class="admin-press text-faint hover:text-ink transition-colors"
                    title="Copy Winning Ticket Code"
                    on:click={() => copyToClipboard(draw.winningTicketCode, 'Winning Ticket Code')}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
              <div class="border-t border-success/15 pt-2 text-[11px] text-muted">
                <p class="font-semibold text-ink">{prizeLabel(draw.tier)} · {draw.winnerName ?? 'Verified Participant'}</p>
                <div class="mt-1 flex items-center gap-1.5 font-mono text-[11px] font-bold text-ink">
                  <a href="tel:{draw.winnerPhone}" class="hover:text-primary hover:underline" title="Call winner">{draw.winnerPhone}</a>
                  <button
                    type="button"
                    class="admin-press text-faint hover:text-ink transition-colors"
                    title="Copy Winner Phone"
                    on:click={() => copyToClipboard(draw.winnerPhone, 'Winner Phone')}
                  >
                    <Copy size={11} />
                  </button>
                </div>
                <p class="text-[10px] text-faint mt-1">{new Date(draw.drawnAt).toLocaleString()}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Reason field (Owner only, used when assigning/reassigning a representative below) ── -->
    {#if $auth.admin?.role === 'owner' && engine.prizes.length > 0}
      <div class="mt-5 rounded-button border border-primary/20 bg-primary-bg/25 p-4.5">
        <label class="text-xs font-bold text-ink">
          Reason for representative assignment
          <input
            bind:value={reason}
            maxlength="500"
            class="mt-1.5 h-10 w-full rounded-button border border-border bg-card px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <p class="mt-2 text-[11px] leading-4 text-muted">
          Prizes draw strictly in order — 1st, then 2nd, then 3rd. Once a tier's representative approves, the system automatically
          picks a random participant and sends their draw link — no further admin action needed.
        </p>
      </div>
    {/if}

    <!-- ── Main Grid: Participants Directory (Left) & Draw Links (Right) ── -->
    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      <!-- ── Left: Detailed Participant Directory ── -->
      <div>
        <div class="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-sm font-extrabold text-ink flex items-center gap-2">
              <Users size={15} class="text-primary" />
              Participant Directory & All Tickets
            </h3>
            <p class="text-[11px] text-faint">
              Showing {filteredParticipants.length} of {engine.participants.length} accounts
            </p>
          </div>

          <!-- Search Input -->
          <div class="relative w-full sm:w-64">
            <Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              bind:value={participantSearch}
              placeholder="Search by name, phone, ticket…"
              class="h-9 w-full rounded-button border border-border bg-bg/60 pl-8.5 pr-8 text-xs text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none transition-colors"
            />
            {#if participantSearch}
              <button
                type="button"
                on:click={() => (participantSearch = '')}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            {/if}
          </div>
        </div>

        <!-- Participants Card List / Table -->
        <div class="overflow-hidden rounded-button border border-border bg-card shadow-xs">
          {#if engine.participants.length === 0}
            <div class="flex flex-col items-center justify-center p-8 text-center">
              <Ticket size={28} class="text-faint" />
              <p class="mt-2 text-xs font-bold text-ink">No paid tickets yet</p>
              <p class="text-[11px] text-muted">When participants buy tickets, their contact info and ticket codes appear here.</p>
            </div>
          {:else if filteredParticipants.length === 0}
            <div class="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle size={24} class="text-muted" />
              <p class="mt-2 text-xs font-bold text-ink">No participants match "{participantSearch}"</p>
              <button
                type="button"
                on:click={() => (participantSearch = '')}
                class="mt-2 text-xs font-bold text-primary hover:underline"
              >
                Clear search filter
              </button>
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each filteredParticipants as participant (participant.id)}
                {@const ticketList = participant.ticketNumbers ?? [participant.firstTicket]}
                {@const wonTiers = winningTiersByUserId[participant.id]}
                <div class="flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-start sm:justify-between {wonTiers ? 'bg-success-bg/60 hover:bg-success-bg/80' : 'hover:bg-bg/40'}">
                  <!-- User Info Strip -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black {wonTiers ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'}">
                        {(participant.fullName?.[0] ?? 'P').toUpperCase()}
                      </div>
                      <div class="min-w-0">
                        <p class="truncate text-xs font-extrabold text-ink flex items-center gap-1.5">
                          {participant.fullName ?? 'Participant (No Name)'}
                          {#if wonTiers}
                            <span class="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-black text-success">
                              {wonTiers.length > 1 ? 'Multiple prize winner' : `${ordinal(wonTiers[0])} prize winner`}
                            </span>
                          {/if}
                        </p>
                        <!-- Phone with quick actions -->
                        <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                          <a
                            href="tel:{participant.phone}"
                            class="font-semibold hover:text-primary hover:underline"
                            title="Call participant"
                          >
                            {participant.phone}
                          </a>
                          <button
                            type="button"
                            class="admin-press text-faint hover:text-ink transition-colors"
                            title="Copy Phone Number"
                            on:click={() => copyToClipboard(participant.phone, `Phone (${participant.phone})`)}
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Exact Ticket Numbers (Pills) -->
                    <div class="mt-2.5">
                      <p class="text-[10px] font-bold uppercase tracking-[0.08em] text-faint mb-1">
                        Exact Ticket Numbers:
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each ticketList as tNum}
                          {@const code = ticketCode(tNum)}
                          <button
                            type="button"
                            class="group inline-flex items-center gap-1 rounded-[6px] border border-border bg-bg/80 px-2 py-0.5 font-mono text-[10px] font-bold text-ink transition-all hover:border-primary/50 hover:bg-primary-bg hover:text-primary-dark"
                            title="Click to copy ticket code {code}"
                            on:click={() => copyToClipboard(code, `Ticket ${code}`)}
                          >
                            <span>{code}</span>
                            <Copy size={9} class="opacity-40 group-hover:opacity-100" />
                          </button>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <!-- Count Badge -->
                  <div class="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <span class="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2.5 py-1 text-[11px] font-extrabold text-primary-dark">
                      <Ticket size={11} />
                      {participant.ticketCount} {participant.ticketCount === 1 ? 'ticket' : 'tickets'}
                    </span>
                    <span class="text-[10px] text-faint font-mono">
                      #{participant.firstTicket} – #{participant.lastTicket}
                    </span>
                    <span class="flex items-center gap-1 text-[10px] text-faint" title="Last ticket purchased">
                      <CalendarDays size={10} /> {toEthiopianDate(participant.lastPurchasedAt)}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- ── Right: Prize Draw Links (random trigger recipients) — fully
           automatic: the system generates and sends each tier's link the
           moment its representative approves (see the panel below), and
           auto-reassigns it if it expires unclicked. Read-only status,
           no admin action here at all. ── -->
      <div>
        <h3 class="mb-1 text-sm font-extrabold text-ink flex items-center gap-2">
          <Link2 size={15} class="text-primary" />
          Trigger Recipients
        </h3>
        <p class="mb-3 text-[11px] leading-4 text-faint">Fully automatic — the system picks and notifies a random participant once a tier is cleared to start.</p>

        <div class="space-y-3">
          {#if engine.prizes.length === 0}
            <div class="rounded-button border border-dashed border-border p-6 text-center text-xs text-faint">
              No prize tiers configured for this raffle.
            </div>
          {:else}
            {#each engine.prizes as prize (prize.tier)}
              {@const trigger = engine.triggers.find((t) => t.tier === prize.tier)}
              {@const rep = engine.representatives.find((r) => r.tier === prize.tier)}
              {@const drawn = engine.draws.some((d) => d.tier === prize.tier)}
              {@const unlocked = prize.tier === 1 || engine.draws.some((d) => d.tier === prize.tier - 1)}
              <div class="rounded-button border border-border bg-card p-4 transition-all shadow-xs hover:border-primary/30 {!unlocked && !trigger ? 'opacity-60' : ''}">
                <div class="flex items-center justify-between">
                  <div class="min-w-0">
                    <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                      {ordinal(prize.tier)} Tier
                    </span>
                    <h4 class="mt-1 truncate text-xs font-bold text-ink">{prize.name}</h4>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold
                    {drawn ? 'bg-success-bg text-success'
                      : trigger?.status === 'pending' ? 'bg-warning-bg text-warning'
                      : trigger?.status === 'expired' ? 'bg-danger-bg text-danger'
                      : 'bg-bg text-faint'}"
                  >
                    {drawn ? 'Draw completed'
                      : trigger?.status === 'pending' ? 'Sent · awaiting spin'
                      : trigger?.status === 'expired' ? 'Expired · auto-reassigning'
                      : !unlocked ? 'Waiting on previous tier'
                      : rep?.status === 'approved' ? 'Starting…'
                      : 'Waiting on representative'}
                  </span>
                </div>

                {#if !unlocked && !trigger}
                  <p class="mt-3 text-[11px] leading-4 text-faint">Unlocks once the {ordinal(prize.tier - 1)} prize has been drawn.</p>
                {:else if unlocked && !trigger && rep?.status !== 'approved'}
                  <p class="mt-3 text-[11px] leading-4 text-faint">Waiting for this tier's representative to approve before the system starts the draw automatically.</p>
                {/if}

                {#if trigger?.phone}
                  <div class="mt-3 rounded-button border border-border/70 bg-bg/40 p-2.5 text-[11px]">
                    <div class="flex items-center justify-between">
                      <span class="text-faint">Selected participant:</span>
                      <div class="flex items-center gap-1 font-mono font-bold text-ink">
                        <span>{trigger.phone}</span>
                        <button
                          type="button"
                          class="admin-press text-faint hover:text-ink transition-colors"
                          title="Copy Selected Participant Phone"
                          on:click={() => copyToClipboard(trigger.phone, 'Selected participant phone')}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                    {#if (trigger.status === 'pending' || drawn) && trigger.sentAt}
                      <div class="mt-1 flex items-center justify-between text-[10px] text-faint">
                        <span>Dispatched:</span>
                        <span>{new Date(trigger.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    {/if}
                    {#if trigger.status === 'pending' && !drawn && trigger.expiresAt}
                      <div class="mt-0.5 flex items-center justify-between text-[10px] text-faint">
                        <span>Expires:</span>
                        <span class="text-warning font-semibold">{new Date(trigger.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    {/if}
                  </div>
                {:else if trigger?.status === 'expired'}
                  <p class="mt-3 rounded-button border border-danger/25 bg-danger-bg/60 p-2.5 text-[11px] leading-4 text-muted">
                    That link expired unclicked — the system is automatically picking a different participant.
                  </p>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- ── Per-Tier Draw Representatives (admin-assigned witness) ── -->
    {#if engine.prizes.length > 0}
      <div class="mt-6 border-t border-border pt-5">
        <h3 class="mb-1.5 text-sm font-extrabold text-ink flex items-center gap-2">
          <ShieldCheck size={15} class="text-primary" />
          Per-Tier Draw Representatives
        </h3>
        <p class="mb-3 max-w-2xl text-[11px] leading-4 text-faint">
          Pick one ticket holder per tier to witness that draw. Their approval is required before that tier's random trigger link can be generated.
        </p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each engine.prizes as prize (prize.tier)}
            {@const rep = engine.representatives.find((r) => r.tier === prize.tier)}
            {@const canAssign = $auth.admin?.role === 'owner'}
            <div class="rounded-button border border-border bg-card p-4 shadow-xs">
              <div class="flex items-center justify-between">
                <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                  {ordinal(prize.tier)} Tier
                </span>
                <span
                  class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold
                  {rep?.status === 'approved' ? 'bg-success-bg text-success'
                    : rep?.status === 'assigned' ? 'bg-warning-bg text-warning'
                    : rep?.status === 'expired' ? 'bg-danger-bg text-danger'
                    : 'bg-bg text-faint'}"
                >
                  {rep?.status === 'approved' ? 'Approved'
                    : rep?.status === 'assigned' ? 'Awaiting approval'
                    : rep?.status === 'expired' ? 'Expired · reassign'
                    : 'Not assigned'}
                </span>
              </div>

              {#if rep}
                <div class="mt-3 rounded-button border border-border/70 bg-bg/40 p-2.5 text-[11px]">
                  <div class="flex items-center justify-between">
                    <span class="text-faint">Representative:</span>
                    <span class="font-bold text-ink">{rep.fullName ?? 'Unnamed participant'}</span>
                  </div>
                  <div class="mt-1 flex items-center justify-between">
                    <span class="text-faint">Phone:</span>
                    <div class="flex items-center gap-1 font-mono font-bold text-ink">
                      <span>{rep.phone}</span>
                      <button
                        type="button"
                        class="admin-press text-faint hover:text-ink transition-colors"
                        title="Copy Representative Phone"
                        on:click={() => copyToClipboard(rep.phone, 'Representative phone')}
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>
                  {#if rep.status === 'approved' && rep.approvedAt}
                    <div class="mt-1 flex items-center justify-between text-[10px] text-faint">
                      <span>Approved:</span>
                      <span>{new Date(rep.approvedAt).toLocaleString()}</span>
                    </div>
                  {:else if rep.status === 'assigned' && rep.expiresAt}
                    <div class="mt-1 flex items-center justify-between text-[10px] text-faint">
                      <span>Expires:</span>
                      <span class="text-warning font-semibold">{new Date(rep.expiresAt).toLocaleString()}</span>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if canAssign}
                {#if repPickerOpenTier === prize.tier}
                  <div class="mt-3">
                    <div class="relative">
                      <Search size={13} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        type="text"
                        value={repSearch[prize.tier] ?? ''}
                        on:input={(e) => (repSearch = { ...repSearch, [prize.tier]: e.currentTarget.value })}
                        placeholder="Search ticket holders…"
                        class="h-9 w-full rounded-button border border-border bg-bg/60 pl-8 pr-2 text-xs text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none"
                      />
                    </div>
                    <div class="mt-2 max-h-40 overflow-y-auto rounded-button border border-border">
                      {#each filterParticipants(repSearch[prize.tier] ?? '') as p (p.id)}
                        <button
                          type="button"
                          disabled={assigningTier === prize.tier}
                          on:click={() => assignRepresentative(prize.tier, p.id)}
                          class="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-[11px] last:border-b-0 hover:bg-bg/60 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span class="truncate font-semibold text-ink">{p.fullName ?? 'Participant (No Name)'}</span>
                          <span class="shrink-0 font-mono text-faint">{p.phone}</span>
                        </button>
                      {:else}
                        <p class="p-3 text-center text-[11px] text-faint">No ticket holders match.</p>
                      {/each}
                    </div>
                    <button
                      type="button"
                      class="mt-2 text-[11px] font-bold text-muted hover:text-ink"
                      on:click={() => (repPickerOpenTier = null)}
                    >
                      Cancel
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    on:click={() => (repPickerOpenTier = prize.tier)}
                    class="admin-press mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-button text-[11px] font-bold shadow-xs transition-colors {rep ? 'border border-border bg-card text-muted hover:text-ink hover:border-primary/40' : 'bg-primary text-white'}"
                  >
                    <Users size={12} />
                    {rep ? 'Reassign representative' : 'Choose representative'}
                  </button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Extension History ── -->
    {#if engine.extensions.length > 0}
      <div class="mt-6 border-t border-border pt-5">
        <h3 class="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-faint">Deadline Extension Log</h3>
        <div class="space-y-2">
          {#each engine.extensions as extension}
            <div class="rounded-button bg-bg/50 px-4 py-3 border border-border/60">
              <p class="text-xs font-bold text-ink">Extended to {new Date(extension.newDeadline).toLocaleString()}</p>
              <p class="mt-1 text-[11px] leading-5 text-faint">
                {extension.reason} · {extension.ticketsSoldAtExtension} tickets sold at extension
              </p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>
