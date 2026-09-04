<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { toast } from '$lib/stores/toast.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import RaffleEngine from '$lib/components/RaffleEngine.svelte';
  import type { Raffle } from '$lib/schemas/index.js';
  import { ArrowLeft, CalendarClock, Check, ExternalLink, LockKeyhole, MessageCircle, Plus, Save, Send, ShieldAlert, Trash2, UploadCloud } from 'lucide-svelte';
  import PrizeImage from '$lib/components/PrizeImage.svelte';

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
  let telegramGroupLink = '';

  let nextRowKey = 0;
  type PrizeRow = { key: number; id: string | null; name: string; value: string; imageUrl: string | null; uploading: boolean };
  let additionalPrizes: PrizeRow[] = [];
  const rankLabels = ['1st', '2nd', '3rd'];

  // Tier 1's own id/photo — separate from prizeName/prizeValue above (those
  // stay bound to the raffle's legacy single-prize fields, the one shared
  // source of truth for the "grand prize" name/value), but the photo is
  // tier 1's own row in raffle_prizes, same as tiers 2 and 3.
  let grandPrizeId: string | null = null;
  let grandPrizeImageUrl: string | null = null;
  let grandPrizeUploading = false;

  async function uploadGrandPrizeImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !raffle || !grandPrizeId) return;
    grandPrizeUploading = true;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.upload<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/prizes/${grandPrizeId}/image`, formData);
      hydrate(res.raffle);
      success = 'Grand prize photo updated.';
      toast.success('Grand prize photo updated.', 'Photo Uploaded');
    } catch (err) {
      error = err instanceof ApiError ? 'Could not upload that image — try a different file.' : 'Network error.';
      toast.error(error, 'Upload Failed');
      grandPrizeUploading = false;
    } finally {
      input.value = '';
    }
  }

  function addPrizeTier() {
    if (additionalPrizes.length >= 2) return;
    additionalPrizes = [...additionalPrizes, { key: nextRowKey++, id: null, name: '', value: '', imageUrl: null, uploading: false }];
  }
  function removePrizeTier(key: number) {
    additionalPrizes = additionalPrizes.filter((row) => row.key !== key);
  }

  async function uploadPrizeImage(e: Event, row: PrizeRow) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !raffle || !row.id) return;
    row.uploading = true;
    additionalPrizes = additionalPrizes;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.upload<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/prizes/${row.id}/image`, formData);
      hydrate(res.raffle);
      success = `${row.name || 'Prize'} photo updated.`;
      toast.success(`${row.name || 'Prize'} photo updated.`, 'Photo Uploaded');
    } catch (err) {
      error = err instanceof ApiError ? 'Could not upload that image — try a different file.' : 'Network error.';
      toast.error(error, 'Upload Failed');
      row.uploading = false;
      additionalPrizes = additionalPrizes;
    } finally {
      input.value = '';
    }
  }

  function hydrate(value: Raffle) {
    raffle = value;
    title = value.title;
    description = value.description ?? '';
    prizeName = value.prizeName;
    prizeValue = value.prizeValue;
    const tier1 = value.prizes?.find((p) => p.tier === 1);
    grandPrizeId = tier1?.id ?? null;
    grandPrizeImageUrl = tier1?.imageUrl ?? null;
    grandPrizeUploading = false;
    ticketPrice = value.ticketPrice;
    ticketCap = value.ticketCap;
    maxTicketsPerUser = value.maxTicketsPerUser;
    additionalPrizes = (value.prizes ?? [])
      .filter((p) => p.tier > 1)
      .sort((a, b) => a.tier - b.tier)
      .map((p) => ({ key: nextRowKey++, id: p.id, name: p.name, value: String(p.value), imageUrl: p.imageUrl, uploading: false }));
    const next = new Date(value.currentDeadline);
    next.setDate(next.getDate() + 1);
    deadlineAt = next.toISOString().slice(0, 16);
    telegramGroupLink = value.telegramGroupLink ?? '';
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
      // prizeValue/ticketPrice arrive from the API as NUMERIC columns,
      // which postgres.js serializes as strings (avoids float precision
      // loss) — hydrate() loads that string straight into these bound
      // vars, and Svelte only coerces a number input back to a real
      // number when the user actually retypes it. Saving without ever
      // touching those fields would silently resend a string and fail the
      // API's z.number() validation with a 400 — Number(...) here makes
      // the type correct regardless of whether the field was touched.
      const payload: Record<string, unknown> = {
        title,
        description: description || null,
        prizeName,
        prizeValue: Number(prizeValue),
        additionalPrizes: additionalPrizes.map((row) => ({ name: row.name, value: Number(row.value) })),
        telegramGroupLink: telegramGroupLink.trim() || null,
      };
      if (raffle.ticketsSold === 0) {
        Object.assign(payload, {
          ticketPrice: Number(ticketPrice),
          ticketCap: Number(ticketCap),
          maxTicketsPerUser: Number(maxTicketsPerUser),
        });
      }
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}`, payload);
      hydrate(res.raffle);
      success = 'Raffle details saved.';
      toast.success('Raffle details saved successfully.', 'Saved');
    } catch (err) {
      error = err instanceof ApiError ? 'The raffle could not be updated. Check the values and current status.' : 'Network error.';
      toast.error(error, 'Save Failed');
    } finally { saving = false; }
  }

  async function changeStatus(status: Raffle['status']) {
    if (!raffle) return;
    action = status; error = ''; success = '';
    try {
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/status`, { status, reason: `Changed to ${status} by Platform Owner` });
      hydrate(res.raffle);
      success = `Raffle is now ${status.replace('_', ' ')}.`;
      toast.success(`Raffle is now ${status.replace('_', ' ')}.`, 'Status Updated');
    } catch (err) {
      error = err instanceof ApiError ? 'That status change is not allowed from the current stage.' : 'Network error.';
      toast.error(error, 'Status Change Failed');
    } finally { action = ''; }
  }

  async function extendDeadline() {
    if (!raffle || !deadlineAt) return;
    action = 'deadline'; error = ''; success = '';
    try {
      const res = await api.patch<{ raffle: Raffle }>(`/admin/raffles/${raffle.id}/deadline`, { deadlineAt: new Date(deadlineAt).toISOString(), reason: deadlineReason });
      hydrate(res.raffle);
      success = 'Deadline extension recorded.';
      toast.success('Deadline extension recorded.', 'Deadline Extended');
    } catch (err) {
      error = err instanceof ApiError ? 'The deadline must be later than the current deadline.' : 'Network error.';
      toast.error(error, 'Extension Failed');
    } finally { action = ''; }
  }

  onMount(load);
  const inputClass = 'h-11 rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink focus:border-primary focus:bg-card focus:outline-none disabled:cursor-not-allowed disabled:opacity-55';
  const labelClass = 'flex flex-col gap-2 text-xs font-bold text-ink';
</script>

<svelte:head><title>{raffle?.title ?? 'Raffle'} · YeneEta Admin</title></svelte:head>

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
          <PrizeImage src={raffle.prizeImageUrl} alt={raffle.prizeName} iconSize={24} class="aspect-[4/3] w-full shrink-0 rounded-[13px] border border-border bg-card" />
          <div class="min-w-0 px-1 py-2">
            <p class="text-xs font-bold text-ink">Prize cover image</p>
            <p class="mt-1 max-w-sm text-[11px] leading-5 text-faint">Photos are resized, stripped of metadata and converted to WebP before storage.</p>
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
          <div class="sm:col-span-2 rounded-[16px] border border-border bg-bg/40 p-4">
            <div class="flex items-center gap-2.5"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">1</span><span class="text-xs font-bold text-ink">Grand prize</span></div>
            <div class="mt-4 flex gap-4">
              <div class="flex shrink-0 flex-col items-center gap-1.5">
                {#key grandPrizeImageUrl}
                  <div in:fade={{ duration: 200, easing: cubicOut }}>
                    <PrizeImage src={grandPrizeImageUrl} alt={prizeName} class="h-16 w-16 rounded-[12px] border border-border bg-card" />
                  </div>
                {/key}
                {#if grandPrizeId}
                  <label class="admin-press flex h-6 cursor-pointer items-center rounded-full bg-bg px-2 text-[9px] font-bold text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
                    {grandPrizeUploading ? '…' : grandPrizeImageUrl ? 'Change' : 'Add photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="hidden" disabled={grandPrizeUploading} on:change={uploadGrandPrizeImage} />
                  </label>
                {/if}
              </div>
              <div class="grid flex-1 gap-4 sm:grid-cols-2">
                <label class={labelClass}>Prize name<input required minlength="2" maxlength="200" bind:value={prizeName} class={inputClass} /></label>
                <label class={labelClass}>Prize value (ETB)<input required type="number" min="0.01" step="0.01" bind:value={prizeValue} class={inputClass} /></label>
              </div>
            </div>
          </div>

          {#each additionalPrizes as row, i (row.key)}
            <div
              class="sm:col-span-2 rounded-[16px] border border-border bg-bg/40 p-4"
              in:fly={{ y: -8, duration: 220, easing: cubicOut }}
              animate:flip={{ duration: 220, easing: cubicOut }}
            >
              <div class="flex items-center gap-2.5">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-bg text-[10px] font-black text-warning">{i + 2}</span>
                <span class="text-xs font-bold text-ink">{rankLabels[i + 1]} prize</span>
                <button type="button" on:click={() => removePrizeTier(row.key)} class="admin-press ml-auto flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-danger-bg hover:text-danger" aria-label="Remove {rankLabels[i + 1]} prize"><Trash2 size={13} /></button>
              </div>
              <div class="mt-4 flex gap-4">
                <div class="flex shrink-0 flex-col items-center gap-1.5">
                  {#key row.imageUrl}
                    <div in:fade={{ duration: 200, easing: cubicOut }}>
                      <PrizeImage src={row.imageUrl} alt={row.name} class="h-16 w-16 rounded-[12px] border border-border bg-card" />
                    </div>
                  {/key}
                  {#if row.id}
                    <label class="admin-press flex h-6 cursor-pointer items-center rounded-full bg-bg px-2 text-[9px] font-bold text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
                      {row.uploading ? '…' : row.imageUrl ? 'Change' : 'Add photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="hidden" disabled={row.uploading} on:change={(e) => uploadPrizeImage(e, row)} />
                    </label>
                  {/if}
                </div>
                <div class="grid flex-1 gap-4 sm:grid-cols-2">
                  <label class={labelClass}>Prize name<input required minlength="2" maxlength="200" bind:value={row.name} class={inputClass} /></label>
                  <label class={labelClass}>Prize value (ETB)<input required type="number" min="0.01" step="0.01" bind:value={row.value} class={inputClass} /></label>
                  {#if !row.id}<p class="sm:col-span-2 text-[10px] text-faint">Save the raffle once to add a photo for this prize.</p>{/if}
                </div>
              </div>
            </div>
          {/each}

          {#if additionalPrizes.length < 2}
            <button type="button" on:click={addPrizeTier} class="admin-press sm:col-span-2 flex h-11 w-full items-center justify-center gap-2 rounded-button border border-dashed border-border text-xs font-bold text-muted hover:border-primary/40 hover:text-primary"><Plus size={14} /> Add a {rankLabels[additionalPrizes.length + 1]} prize</button>
          {/if}

          <label class="sm:col-span-2 {labelClass}">Description<textarea maxlength="2000" rows="4" bind:value={description} class="rounded-button border border-border bg-bg/55 px-3.5 py-3 text-sm leading-6 text-ink focus:border-primary focus:bg-card focus:outline-none"></textarea><span class="font-normal text-faint">Explain exactly what the winner receives.</span></label>

          <div class="sm:col-span-2 mt-2 border-t border-border pt-6"><h3 class="text-sm font-bold text-ink">Community</h3><p class="mt-1 text-xs font-normal text-faint">Shown as a pinned, tappable banner in every buyer's room chat for this raffle.</p></div>
          <label class="sm:col-span-2 {labelClass}">
            Telegram group invite link
            <input type="url" bind:value={telegramGroupLink} placeholder="https://t.me/+AbCdEfGhIjK" class={inputClass} />
            <span class="font-normal text-faint">Create the group in Telegram yourself first, then paste its invite link here — nothing is auto-created.</span>
          </label>
          {#if telegramGroupLink}
            <a
              href={telegramGroupLink}
              target="_blank"
              rel="noopener noreferrer"
              class="admin-press -mt-2 flex w-fit items-center gap-1.5 rounded-full bg-[#229ED9]/10 px-3 py-1.5 text-[11px] font-bold text-[#0d6d94] no-underline ring-1 ring-[#229ED9]/25"
            >
              <Send size={11} /> Open group link <ExternalLink size={11} />
            </a>
          {/if}

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
