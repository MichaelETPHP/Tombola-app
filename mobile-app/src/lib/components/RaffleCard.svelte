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
  export let eager = false;

  $: soldPct = raffle.ticketCap > 0 ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
  $: ticketsRemaining = Math.max(0, raffle.ticketCap - raffle.ticketsSold);
  $: daysLeft = Math.max(0, Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / 86_400_000));
  $: canEnter = raffle.status === 'open' && ticketsRemaining > 0;
</script>

<a
  href="/raffles/{raffle.id}"
  class="raffle-ticket tappable pressable grid min-h-[158px] grid-cols-[112px_1fr] overflow-hidden rounded-[18px] bg-card text-inherit no-underline"
  in:fly={{ y: 8, duration: 220, delay: Math.min(index, 4) * 35, easing: cubicOut }}
  aria-label="View {raffle.title}"
>
  <div class="relative min-h-full overflow-hidden bg-[#dff7ee]">
    <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="sm" fit="contain" {eager} />
    <span class="absolute bottom-2 left-2 rounded-full bg-[#10211d]/82 px-2 py-1 text-[9px] font-extrabold text-white backdrop-blur-md">{formatEtb(raffle.ticketPrice)} ETB</span>
  </div>

  <div class="flex min-w-0 flex-col p-3.5">
    <div class="flex min-w-0 items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="line-clamp-2 font-sans text-[14px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink">{raffle.title}</h3>
        <p class="mt-1 truncate text-[10px] font-medium text-[#626878]">{raffle.prizeName}</p>
      </div>
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action-bg text-primary-dark"><ArrowRight size={14} strokeWidth={2.4} /></span>
    </div>

    <div class="mt-auto">
      <div class="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-semibold text-[#626878]">
        <span class="flex items-center gap-1"><Ticket size={10} /> {ticketsRemaining} left</span>
        <span class="flex items-center gap-1"><Clock3 size={10} /> {daysLeft}d</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-dot-inactive/75">
        <div class="h-full rounded-full bg-primary-dark transition-[width] duration-500 ease-[var(--ease-out)]" style="width: {soldPct}%"></div>
      </div>
      <p class="mt-2 text-[10px] font-extrabold text-primary-dark">
        {#if ticketsOwned > 0}{ticketsOwned} tickets owned{:else if canEnter}Choose your tickets{:else}View raffle result{/if}
      </p>
    </div>
  </div>
</a>

<style>
  .raffle-ticket {
    border: 1px solid rgba(255, 255, 255, 0.86);
    box-shadow: 0 12px 28px -21px rgba(17, 54, 44, 0.42);
  }
</style>
