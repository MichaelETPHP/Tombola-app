<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import RaffleEngine from '$lib/components/RaffleEngine.svelte';
  import type { Raffle } from '$lib/schemas/index.js';
  import { ArrowLeft, CalendarClock, Check, ImagePlus, LockKeyhole, MessageCircle, Save, ShieldAlert, UploadCloud } from 'lucide-svelte';

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

  let uploadingImage = false;
  let imageError = '';
  let imageNote = '';

  async function uploadImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !raffle) return;
    imageError = '';
    imageNote = '';
    uploadingImage = true;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.upload<{ raffle: Raffle; image: { width: number; height: number; bytes: number; format: string } }>(`/admin/raffles/${raffle.id}/image`, formData);
      hydrate(res.raffle);
      imageNote = `Stored as ${res.image.width} × ${res.image.height} WebP · ${Math.max(1, Math.round(res.image.bytes / 1024))} KB`;
    } catch (err) {
      imageError = err instanceof ApiError ? 'Could not upload that image — try a different file.' : 'Network error.';
    } finally {
      uploadingImage = false;
      input.value = '';
    }
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
      <a href="/raffles/{raffle.id}/room" class="admin-press inline-flex h-11 shrink-0 items-center gap-2 rounded-button border border-border bg-card px-5 text-xs font-bold text-ink"><MessageCircle size={15} class="text-primary" /> View room</a>
    </header>

    {#if error}<p class="mb-4 rounded-button bg-danger-bg px-4 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}
    {#if success}<p class="mb-4 flex items-center gap-2 rounded-button bg-success-bg px-4 py-3 text-xs font-medium text-success"><Check size={15} /> {success}</p>{/if}

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form class="rounded-card border border-border bg-card p-5 sm:p-6" on:submit|preventDefault={saveDetails}>
        <div class="mb-6"><h2 class="text-sm font-bold text-ink">Prize and ticket information</h2><p class="mt-1 text-xs text-faint">Ticket economics lock automatically after the first successful sale.</p></div>

        <div class="mb-7 grid gap-4 rounded-[16px] border border-border bg-bg/40 p-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
          <div class="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-[13px] border border-border bg-card">
            {#if raffle.prizeImageUrl}
              <img src={raffle.prizeImageUrl} alt={raffle.prizeName} class="h-full w-full object-cover" />
            {:else}
              <ImagePlus size={24} class="text-faint" />
            {/if}
          </div>
          <div class="min-w-0 px-1 py-2">
            <p class="text-xs font-bold text-ink">Prize cover image</p>
            <p class="mt-1 max-w-sm text-[11px] leading-5 text-faint">Photos are resized, stripped of metadata and converted to WebP before Supabase storage.</p>
            <label class="admin-press mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
              <UploadCloud size={15} />
              {uploadingImage ? 'Uploading…' : raffle.prizeImageUrl ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="hidden" disabled={uploadingImage} on:change={uploadImage} />
            </label>
            <p class="mt-2 text-[10px] text-faint">JPG, PNG, WebP or AVIF · maximum 8 MB</p>
            {#if imageNote}<p class="mt-1 text-[11px] font-semibold text-success">{imageNote}</p>{/if}
            {#if imageError}<p class="mt-1 text-[11px] font-medium text-danger">{imageError}</p>{/if}
          </div>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <label class="sm:col-span-2 {labelClass}">Raffle title<input required minlength="3" maxlength="200" bind:value={title} class={inputClass} /></label>
          <label class={labelClass}>Prize name<input required minlength="2" maxlength="200" bind:value={prizeName} class={inputClass} /></label>
          <label class={labelClass}>Prize value (ETB)<input required type="number" min="0.01" step="0.01" bind:value={prizeValue} class={inputClass} /></label>
          <label class="sm:col-span-2 {labelClass}">Description<textarea maxlength="2000" rows="4" bind:value={description} class="rounded-button border border-border bg-bg/55 px-3.5 py-3 text-sm leading-6 text-ink focus:border-primary focus:bg-card focus:outline-none"></textarea><span class="font-normal text-faint">Explain exactly what the winner receives.</span></label>
          <div class="sm:col-span-2 mt-2 flex items-start justify-between gap-4 border-t border-border pt-6"><div><h3 class="text-sm font-bold text-ink">Ticket rules</h3><p class="mt-1 text-xs font-normal text-faint">These values define the published purchase contract.</p></div>{#if raffle.ticketsSold > 0}<span class="flex shrink-0 items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-1 text-[10px] font-bold text-warning"><LockKeyhole size={11} /> Locked after first sale</span>{/if}</div>
          <label class={labelClass}>Ticket price (ETB)<input required type="number" min="0.01" step="0.01" disabled={raffle.ticketsSold > 0} bind:value={ticketPrice} class={inputClass} /><span class="font-normal text-faint">Price for one chance.</span></label>
          <label class={labelClass}>Ticket quota<input required type="number" min="10" step="1" disabled={raffle.ticketsSold > 0} bind:value={ticketCap} class={inputClass} /><span class="font-normal text-faint">Total tickets available.</span></label>
          <label class={labelClass}>Maximum per participant<input required type="number" min="1" max="5" step="1" disabled={raffle.ticketsSold > 0} bind:value={maxTicketsPerUser} class={inputClass} /><span class="font-normal text-faint">Between 1 and 5.</span></label>
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
    <RaffleEngine raffleId={raffle.id} />
  </div>
{/if}
