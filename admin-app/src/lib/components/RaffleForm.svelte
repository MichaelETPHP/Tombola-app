<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { CircleDollarSign, Gift, ImagePlus, Plus, Send, Settings2, Trash2 } from 'lucide-svelte';
  import { createRaffleSchema, type CreateRaffleInput } from '../schemas/index.js';

  const dispatch = createEventDispatcher<{ submit: CreateRaffleInput }>();
  export let submitting = false;
  export let errorMessage = '';

  let title = '';
  let description = '';
  let prizeName = '';
  let categoryCode = '';
  let prizeValue = '';
  let ticketPrice = '';
  let ticketCap = '';
  let maxTicketsPerUser = '5';
  let deadlineDays = '2';
  let telegramGroupLink = '';
  let fieldErrors: Record<string, string> = {};

  // Tier 1 is prizeName/prizeValue above. Each entry here is one more
  // ranked prize (tier 2, tier 3) — capped at 2 additional tiers, matching
  // the API. Rows carry a stable `key` so Svelte's keyed #each animates
  // additions/removals instead of relabeling whichever row sits at index 1.
  let nextRowKey = 0;
  let additionalPrizes: { key: number; name: string; value: string }[] = [];

  function addPrizeTier() {
    if (additionalPrizes.length >= 2) return;
    additionalPrizes = [...additionalPrizes, { key: nextRowKey++, name: '', value: '' }];
  }
  function removePrizeTier(key: number) {
    additionalPrizes = additionalPrizes.filter((row) => row.key !== key);
  }

  function handleSubmit() {
    fieldErrors = {};
    const parsed = createRaffleSchema.safeParse({
      title,
      description: description || undefined,
      prizeName,
      categoryCode,
      prizeValue: Number(prizeValue),
      additionalPrizes: additionalPrizes.length
        ? additionalPrizes.map((row) => ({ name: row.name, value: Number(row.value) }))
        : undefined,
      ticketPrice: Number(ticketPrice),
      ticketCap: Number(ticketCap),
      maxTicketsPerUser: Number(maxTicketsPerUser),
      deadlineDays: Number(deadlineDays),
      telegramGroupLink: telegramGroupLink || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      return;
    }
    dispatch('submit', parsed.data);
  }

  const inputClass = 'h-11 w-full rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none';
  const labelClass = 'text-xs font-bold text-ink';
  const rankLabels = ['1st', '2nd', '3rd'];
  const rankPlaceholders = ['Power bank 20000mAh', 'Flash drive 128GB'];
  const rankValuePlaceholders = ['3500', '900'];
</script>

<form class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" on:submit|preventDefault={handleSubmit}>
  <div class="space-y-5">
    <section class="rounded-card border border-border bg-card p-5 sm:p-6">
      <div class="mb-6 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><Gift size={18} /></span><div><h2 class="text-sm font-bold text-ink">Prize presentation</h2><p class="mt-0.5 text-xs text-faint">What participants will see in the mobile app</p></div></div>
      <div class="space-y-5">
        <label class="flex flex-col gap-2"><span class={labelClass}>Raffle title</span><input id="title" type="text" bind:value={title} class={inputClass} placeholder="New Year Grand Raffle" />{#if fieldErrors.title}<span class="text-xs text-danger">{fieldErrors.title}</span>{/if}</label>

        <div class="rounded-[16px] border border-border bg-bg/35 p-4">
          <div class="flex items-center gap-2.5">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">1</span>
            <span class="text-xs font-bold text-ink">Grand prize</span>
            <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Required</span>
          </div>
          <div class="mt-4 grid gap-5 sm:grid-cols-2">
            <label class="flex flex-col gap-2"><span class={labelClass}>Prize name</span><input id="prizeName" type="text" bind:value={prizeName} class={inputClass} placeholder="iPhone 16 Pro Max 256GB" />{#if fieldErrors.prizeName}<span class="text-xs text-danger">{fieldErrors.prizeName}</span>{/if}</label>
            <label class="flex flex-col gap-2"><span class={labelClass}>Retail value (ETB)</span><input id="prizeValue" type="number" min="0" step="0.01" bind:value={prizeValue} class={inputClass} placeholder="120000" />{#if fieldErrors.prizeValue}<span class="text-xs text-danger">{fieldErrors.prizeValue}</span>{/if}</label>
          </div>
        </div>

        {#each additionalPrizes as row, i (row.key)}
          <div
            class="rounded-[16px] border border-border bg-bg/35 p-4"
            in:fly={{ y: -8, duration: 220, easing: cubicOut }}
            animate:flip={{ duration: 220, easing: cubicOut }}
          >
            <div class="flex items-center gap-2.5">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-bg text-[10px] font-black text-warning">{i + 2}</span>
              <span class="text-xs font-bold text-ink">{rankLabels[i + 1]} prize</span>
              <button
                type="button"
                on:click={() => removePrizeTier(row.key)}
                class="admin-press ml-auto flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-danger-bg hover:text-danger"
                aria-label="Remove {rankLabels[i + 1]} prize"
              ><Trash2 size={13} /></button>
            </div>
            <div class="mt-4 grid gap-5 sm:grid-cols-2">
              <label class="flex flex-col gap-2"><span class={labelClass}>Prize name</span><input type="text" bind:value={row.name} class={inputClass} placeholder={rankPlaceholders[i]} />{#if fieldErrors[`additionalPrizes.${i}.name`]}<span class="text-xs text-danger">{fieldErrors[`additionalPrizes.${i}.name`]}</span>{/if}</label>
              <label class="flex flex-col gap-2"><span class={labelClass}>Retail value (ETB)</span><input type="number" min="0" step="0.01" bind:value={row.value} class={inputClass} placeholder={rankValuePlaceholders[i]} />{#if fieldErrors[`additionalPrizes.${i}.value`]}<span class="text-xs text-danger">{fieldErrors[`additionalPrizes.${i}.value`]}</span>{/if}</label>
            </div>
          </div>
        {/each}

        {#if additionalPrizes.length < 2}
          <button
            type="button"
            on:click={addPrizeTier}
            class="admin-press flex h-11 w-full items-center justify-center gap-2 rounded-button border border-dashed border-border text-xs font-bold text-muted hover:border-primary/40 hover:text-primary"
          ><Plus size={14} /> Add a {rankLabels[additionalPrizes.length + 1]} prize</button>
        {/if}

        <label class="flex max-w-[220px] flex-col gap-2"><span class={labelClass}>Ticket code prefix</span><input id="categoryCode" type="text" maxlength="3" bind:value={categoryCode} on:input={() => categoryCode = categoryCode.replace(/[^a-z]/gi, '').toUpperCase()} class="{inputClass} font-mono uppercase tracking-[0.16em]" placeholder="LAP" />{#if fieldErrors.categoryCode}<span class="text-xs text-danger">{fieldErrors.categoryCode}</span>{/if}<span class="text-[11px] leading-4 text-faint">Three letters. Tickets will look like LAP-001-00021.</span></label>
        <label class="flex flex-col gap-2"><span class={labelClass}>Description <span class="font-medium text-faint">(optional)</span></span><textarea id="description" rows="4" bind:value={description} class="w-full resize-none rounded-button border border-border bg-bg/55 px-3.5 py-3 text-sm leading-6 text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none" placeholder="Add the key product details and what makes this prize exciting."></textarea></label>
        <div class="flex items-start gap-3 rounded-button border border-dashed border-border bg-bg/45 p-4"><ImagePlus size={18} class="mt-0.5 shrink-0 text-faint" /><div><p class="text-xs font-bold text-ink">Prize photo upload is coming next</p><p class="mt-1 text-xs leading-5 text-muted">The current API has no raffle image-upload endpoint. Image controls will be enabled when that endpoint is connected.</p></div></div>
      </div>
    </section>

    <section class="rounded-card border border-border bg-card p-5 sm:p-6">
      <div class="mb-6 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><CircleDollarSign size={18} /></span><div><h2 class="text-sm font-bold text-ink">Ticket economics</h2><p class="mt-0.5 text-xs text-faint">Set the price and fixed number of available chances</p></div></div>
      <div class="grid gap-5 sm:grid-cols-2">
        <label class="flex flex-col gap-2"><span class={labelClass}>Price per ticket (ETB)</span><input id="ticketPrice" type="number" min="0" step="0.01" bind:value={ticketPrice} class={inputClass} placeholder="100" />{#if fieldErrors.ticketPrice}<span class="text-xs text-danger">{fieldErrors.ticketPrice}</span>{/if}</label>
        <label class="flex flex-col gap-2"><span class={labelClass}>Total ticket quota</span><input id="ticketCap" type="number" min="10" step="1" bind:value={ticketCap} class={inputClass} placeholder="500" />{#if fieldErrors.ticketCap}<span class="text-xs text-danger">{fieldErrors.ticketCap}</span>{/if}</label>
      </div>
    </section>
  </div>

  <aside class="space-y-5">
    <section class="rounded-card border border-border bg-card p-5">
      <div class="mb-5 flex items-center gap-2.5"><Settings2 size={17} class="text-primary" /><h2 class="text-sm font-bold text-ink">Entry rules</h2></div>
      <div class="space-y-5">
        <label class="flex flex-col gap-2"><span class={labelClass}>Maximum per participant</span><input id="maxTicketsPerUser" type="number" min="1" max="5" step="1" bind:value={maxTicketsPerUser} class={inputClass} />{#if fieldErrors.maxTicketsPerUser}<span class="text-xs text-danger">{fieldErrors.maxTicketsPerUser}</span>{/if}<span class="text-[11px] leading-4 text-faint">Participants purchase at least 1 and never more than 5 tickets per raffle.</span></label>
        <label class="flex flex-col gap-2"><span class={labelClass}>Sales deadline (days)</span><input id="deadlineDays" type="number" min="1" max="90" step="1" bind:value={deadlineDays} class={inputClass} />{#if fieldErrors.deadlineDays}<span class="text-xs text-danger">{fieldErrors.deadlineDays}</span>{/if}</label>
      </div>
    </section>

    <section class="rounded-card border border-border bg-card p-5">
      <div class="mb-5 flex items-center gap-2.5"><Send size={16} class="text-primary" /><h2 class="text-sm font-bold text-ink">Telegram group <span class="font-medium text-faint">(optional)</span></h2></div>
      <label class="flex flex-col gap-2">
        <span class={labelClass}>Invite link</span>
        <input id="telegramGroupLink" type="url" bind:value={telegramGroupLink} class={inputClass} placeholder="https://t.me/+AbCdEfGhIjK" />
        {#if fieldErrors.telegramGroupLink}<span class="text-xs text-danger">{fieldErrors.telegramGroupLink}</span>{/if}
        <span class="text-[11px] leading-4 text-faint">Create the group in Telegram yourself first, then paste its invite link here — this is shared with ticket buyers, not auto-created.</span>
      </label>
    </section>

    <section class="rounded-card bg-sidebar p-5 text-white">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-primary">Before publishing</p>
      <ul class="mt-4 space-y-3 text-xs leading-5 text-white/60"><li>Ticket sales close when the quota is reached.</li><li>The draw begins two days after sales close.</li><li>One ticket equals one independent chance to win.</li></ul>
    </section>

    {#if errorMessage}<p class="rounded-button bg-danger-bg p-3 text-xs font-medium text-danger" role="alert">{errorMessage}</p>{/if}
    <button type="submit" class="admin-press h-12 w-full rounded-button bg-primary text-sm font-bold text-white shadow-[0_10px_24px_rgba(21,154,127,0.18)] disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting}>{submitting ? 'Creating raffle…' : 'Create raffle'}</button>
  </aside>
</form>
