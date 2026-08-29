<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';
  import { ArrowRight, Clock3, Ticket } from 'lucide-svelte';

  export let raffle: Raffle;
  export let ticketsOwned = 0;
  export let index = 0;

  $: soldPct = raffle.ticketCap > 0 ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
  $: ticketsRemaining = Math.max(0, raffle.ticketCap - raffle.ticketsSold);
  $: daysLeft = Math.max(
    0,
    Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / 86_400_000)
  );
  $: canEnter = raffle.status === 'open' && ticketsRemaining > 0;
</script>

<a
  href="/raffles/{raffle.id}"
  class="tappable pressable grid min-h-[152px] grid-cols-[116px_1fr] overflow-hidden rounded-card border border-white/70 bg-card text-inherit no-underline shadow-card-light"
  in:fly={{ y: 10, duration: 240, delay: Math.min(index, 6) * 40, easing: cubicOut }}
  aria-label="View {raffle.title}"
>
  <div class="min-h-full bg-[#d9f5e9]">
    <PrizeImage
      src={raffle.prizeImageUrl}
      title={raffle.title}
      prizeName={raffle.prizeName}
      size="sm"
      eager={index < 3}
    />
  </div>

  <div class="flex min-w-0 flex-col justify-between gap-2 p-3.5">
    <div class="min-w-0">
      <div class="mb-1 flex items-start justify-between gap-2">
        <h3 class="line-clamp-2 font-sans text-[15px] font-extrabold leading-[1.18] tracking-[-0.02em] text-ink">
          {raffle.title}
        </h3>
        <ArrowRight size={17} class="mt-0.5 shrink-0 text-primary-dark" strokeWidth={2.25} />
      </div>
      <p class="truncate text-[12px] text-muted">{raffle.prizeName}</p>
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="h-1.5 overflow-hidden rounded-full bg-dot-inactive">
        <div
          class="h-full rounded-full bg-primary-dark transition-[width] duration-500 ease-[var(--ease-out)]"
          style="width: {soldPct}%"
        ></div>
      </div>
      <div class="flex items-center justify-between gap-2 text-[10px] font-medium text-muted">
        <span class="flex items-center gap-1"><Ticket size={11} /> {ticketsRemaining} left</span>
        <span class="flex items-center gap-1"><Clock3 size={11} /> {daysLeft}d</span>
      </div>
    </div>

    <div class="flex items-end justify-between gap-2 border-t border-dot-inactive/70 pt-2">
      <div>
        <p class="text-[9px] font-semibold uppercase tracking-[0.07em] text-muted">Per ticket</p>
        <p class="text-[13px] font-extrabold text-primary-dark">{formatEtb(raffle.ticketPrice)} ETB</p>
      </div>
      <span class="rounded-full bg-bg-start px-2.5 py-1.5 text-[10px] font-bold text-primary-dark">
        {#if ticketsOwned > 0}
          {ticketsOwned} owned
        {:else if canEnter}
          Enter now
        {:else}
          View result
        {/if}
      </span>
    </div>
  </div>
</a>
