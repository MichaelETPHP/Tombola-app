<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { CircleDollarSign, Gift, ImagePlus, Send, Settings2 } from 'lucide-svelte';
  import { createRaffleSchema, type CreateRaffleInput } from '../schemas/index.js';

  const dispatch = createEventDispatcher<{ submit: CreateRaffleInput }>();
  export let submitting = false;
  export let errorMessage = '';

  let title = '';
  let description = '';
  let prizeName = '';
  let prizeValue = '';
  let ticketPrice = '';
  let ticketCap = '';
  let maxTicketsPerUser = '5';
  let deadlineDays = '2';
  let telegramGroupLink = '';
  let fieldErrors: Record<string, string> = {};

  function handleSubmit() {
    fieldErrors = {};
    const parsed = createRaffleSchema.safeParse({
      title,
      description: description || undefined,
      prizeName,
      prizeValue: Number(prizeValue),
      ticketPrice: Number(ticketPrice),
      ticketCap: Number(ticketCap),
      maxTicketsPerUser: Number(maxTicketsPerUser),
      deadlineDays: Number(deadlineDays),
      telegramGroupLink: telegramGroupLink || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
      return;
    }
    dispatch('submit', parsed.data);
  }

  const inputClass = 'h-11 w-full rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none';
  const labelClass = 'text-xs font-bold text-ink';
</script>

<form class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" on:submit|preventDefault={handleSubmit}>
  <div class="space-y-5">
    <section class="rounded-card border border-border bg-card p-5 sm:p-6">
      <div class="mb-6 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><Gift size={18} /></span><div><h2 class="text-sm font-bold text-ink">Prize presentation</h2><p class="mt-0.5 text-xs text-faint">What participants will see in the mobile app</p></div></div>
      <div class="space-y-5">
        <label class="flex flex-col gap-2"><span class={labelClass}>Raffle title</span><input id="title" type="text" bind:value={title} class={inputClass} placeholder="Win an iPhone 16 Pro Max" />{#if fieldErrors.title}<span class="text-xs text-danger">{fieldErrors.title}</span>{/if}</label>
        <div class="grid gap-5 sm:grid-cols-2">
          <label class="flex flex-col gap-2"><span class={labelClass}>Prize name</span><input id="prizeName" type="text" bind:value={prizeName} class={inputClass} placeholder="iPhone 16 Pro Max 256GB" />{#if fieldErrors.prizeName}<span class="text-xs text-danger">{fieldErrors.prizeName}</span>{/if}</label>
          <label class="flex flex-col gap-2"><span class={labelClass}>Retail value (ETB)</span><input id="prizeValue" type="number" min="0" step="0.01" bind:value={prizeValue} class={inputClass} placeholder="120000" />{#if fieldErrors.prizeValue}<span class="text-xs text-danger">{fieldErrors.prizeValue}</span>{/if}</label>
        </div>
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
