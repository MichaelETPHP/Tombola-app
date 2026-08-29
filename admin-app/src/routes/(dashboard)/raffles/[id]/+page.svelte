<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { Raffle } from '$lib/schemas/index.js';
  import { ArrowLeft, CalendarClock, Check, Save, ShieldAlert } from 'lucide-svelte';

  let raffle: Raffle | null = null;
  let loading = true;
  let saving = false;
  let action = '';
  let error = '';
  let success = '';
  let title = '';
  let description = '';
  let prizeName = '';
  let prizeValue = 0;
  let ticketPrice = 0;
  let ticketCap = 0;
  let maxTicketsPerUser = 5;
  let deadlineAt = '';
  let deadlineReason = 'Additional time approved by the Platform Owner';

  function hydrate(value: Raffle) {
    raffle = value;
    title = value.title;
    description = value.description ?? '';
    prizeName = value.prizeName;
    prizeValue = value.prizeValue;
    ticketPrice = value.ticketPrice;
    ticketCap = value.ticketCap;
    maxTicketsPerUser = value.maxTicketsPerUser;
    const next = new Date(value.currentDeadline);
    next.setDate(next.getDate() + 1);
    deadlineAt = next.toISOString().slice(0, 16);
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await api.get<{ raffle: Raffle }>(`/admin/raffles/${$page.params.id}`);
      hydrate(res.raffle);
    } catch { error = 'Could not load this raffle.'; }
    finally { loading = false; }
  }

  async function saveDetails() {
    if (!raffle) return;
    saving = true; error = ''; success = '';
    try {
      const payload: Record<string, unknown> = { title, description: description || null, prizeName, prizeValue };
      if (raffle.ticketsSold === 0) Object.assign(payload, { ticketPrice, ticketCap, maxTicketsPerUser });
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}`, payload);
      hydrate(res.raffle);
      success = 'Raffle details saved.';
    } catch (err) { error = err instanceof ApiError ? 'The raffle could not be updated. Check the values and current status.' : 'Network error.'; }
    finally { saving = false; }
  }

  async function changeStatus(status: Raffle['status']) {
    if (!raffle) return;
    action = status; error = ''; success = '';
    try {
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/status`, { status, reason: `Changed to ${status} by Platform Owner` });
      hydrate(res.raffle);
      success = `Raffle is now ${status.replace('_', ' ')}.`;
    } catch (err) { error = err instanceof ApiError ? 'That status change is not allowed from the current stage.' : 'Network error.'; }
    finally { action = ''; }
  }

  async function extendDeadline() {
    if (!raffle || !deadlineAt) return;
    action = 'deadline'; error = ''; success = '';
    try {
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/deadline`, { deadlineAt: new Date(deadlineAt).toISOString(), reason: deadlineReason });
      hydrate(res.raffle);
      success = 'Deadline extension recorded.';
    } catch (err) { error = err instanceof ApiError ? 'The deadline must be later than the current deadline.' : 'Network error.'; }
    finally { action = ''; }
  }

  onMount(load);
  const inputClass = 'h-11 rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink focus:border-primary focus:bg-card focus:outline-none disabled:cursor-not-allowed disabled:opacity-55';
  const labelClass = 'flex flex-col gap-2 text-xs font-bold text-ink';
</script>

<svelte:head><title>{raffle?.title ?? 'Raffle'} · Tombola Admin</title></svelte:head>

{#if loading}
  <div class="space-y-4">{#each Array(4) as _}<div class="h-20 animate-pulse rounded-card bg-card"></div>{/each}</div>
{:else if !raffle}
  <div class="rounded-card border border-danger/15 bg-danger-bg p-5 text-sm text-danger">{error || 'Raffle not found.'}</div>
{:else}
  <div class="admin-reveal">
    <a href="/raffles" class="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-ink"><ArrowLeft size={15} /> Back to raffles</a>
    <header class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><div class="mb-2 flex items-center gap-2"><p class="text-xs font-bold uppercase tracking-[0.15em] text-primary">Raffle management</p><StatusBadge status={raffle.status} /></div><h1 class="max-w-3xl text-[28px] font-bold tracking-[-0.03em] text-ink">{raffle.title}</h1><p class="mt-2 text-sm text-muted">{raffle.ticketsSold} of {raffle.ticketCap} tickets sold · Deadline {new Date(raffle.currentDeadline).toLocaleString()}</p></div>
    </header>

    {#if error}<p class="mb-4 rounded-button bg-danger-bg px-4 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}
    {#if success}<p class="mb-4 flex items-center gap-2 rounded-button bg-success-bg px-4 py-3 text-xs font-medium text-success"><Check size={15} /> {success}</p>{/if}

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form class="rounded-card border border-border bg-card p-5 sm:p-6" on:submit|preventDefault={saveDetails}>
        <div class="mb-6"><h2 class="text-sm font-bold text-ink">Prize and ticket information</h2><p class="mt-1 text-xs text-faint">Ticket economics lock automatically after the first successful sale.</p></div>
        <div class="grid gap-5 sm:grid-cols-2">
          <label class="sm:col-span-2 {labelClass}">Raffle title<input bind:value={title} class={inputClass} /></label>
          <label class={labelClass}>Prize name<input bind:value={prizeName} class={inputClass} /></label>
          <label class={labelClass}>Prize value (ETB)<input type="number" min="1" bind:value={prizeValue} class={inputClass} /></label>
          <label class="sm:col-span-2 {labelClass}">Description<textarea rows="4" bind:value={description} class="rounded-button border border-border bg-bg/55 px-3.5 py-3 text-sm leading-6 text-ink focus:border-primary focus:bg-card focus:outline-none"></textarea></label>
          <label class={labelClass}>Ticket price (ETB)<input type="number" min="1" disabled={raffle.ticketsSold > 0} bind:value={ticketPrice} class={inputClass} /></label>
          <label class={labelClass}>Ticket quota<input type="number" min="10" disabled={raffle.ticketsSold > 0} bind:value={ticketCap} class={inputClass} /></label>
          <label class={labelClass}>Maximum per participant<input type="number" min="1" max="5" disabled={raffle.ticketsSold > 0} bind:value={maxTicketsPerUser} class={inputClass} /></label>
        </div>
        <button type="submit" disabled={saving} class="admin-press mt-6 flex h-11 items-center gap-2 rounded-button bg-primary px-5 text-xs font-bold text-white disabled:opacity-50"><Save size={15} /> {saving ? 'Saving…' : 'Save changes'}</button>
      </form>

      <aside class="space-y-5">
        <section class="rounded-card border border-border bg-card p-5">
          <h2 class="text-sm font-bold text-ink">Lifecycle controls</h2>
          <p class="mt-1 text-xs leading-5 text-faint">Owner-only actions follow the server’s allowed status transitions.</p>
          <div class="mt-5 space-y-2.5">
            {#if raffle.status === 'draft'}<button type="button" disabled={Boolean(action)} class="admin-press h-11 w-full rounded-button bg-primary text-xs font-bold text-white disabled:opacity-50" on:click={() => changeStatus('open')}>{action === 'open' ? 'Publishing…' : 'Publish raffle'}</button>{/if}
            {#if ['draft', 'open', 'locked', 'awaiting_trigger', 'drawing'].includes(raffle.status) && $auth.admin?.role === 'owner'}<button type="button" disabled={Boolean(action)} class="admin-press h-11 w-full rounded-button border border-danger/20 bg-danger-bg text-xs font-bold text-danger disabled:opacity-50" on:click={() => changeStatus('cancelled')}>{action === 'cancelled' ? 'Cancelling…' : 'Cancel raffle'}</button>{/if}
          </div>
        </section>

        {#if ['draft', 'open'].includes(raffle.status) && $auth.admin?.role === 'owner'}
          <section class="rounded-card border border-border bg-card p-5">
            <div class="mb-4 flex items-center gap-2"><CalendarClock size={17} class="text-primary" /><h2 class="text-sm font-bold text-ink">Extend deadline</h2></div>
            <div class="space-y-4"><label class={labelClass}>New deadline<input type="datetime-local" bind:value={deadlineAt} class={inputClass} /></label><label class={labelClass}>Reason<textarea rows="3" bind:value={deadlineReason} class="rounded-button border border-border bg-bg/55 px-3 py-2 text-xs leading-5 text-ink focus:border-primary focus:outline-none"></textarea></label></div>
            <button type="button" disabled={Boolean(action)} class="admin-press mt-4 h-11 w-full rounded-button bg-sidebar text-xs font-bold text-white disabled:opacity-50" on:click={extendDeadline}>{action === 'deadline' ? 'Recording…' : 'Extend deadline'}</button>
          </section>
        {/if}

        <div class="flex gap-3 rounded-card bg-sidebar p-5 text-white"><ShieldAlert size={18} class="mt-0.5 shrink-0 text-primary" /><p class="text-xs leading-5 text-white/60">Sold-ticket limits, status transitions and deadline history are enforced by the API even if multiple administrators are working.</p></div>
      </aside>
    </div>
  </div>
{/if}
