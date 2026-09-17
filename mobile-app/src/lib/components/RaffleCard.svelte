<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { _ } from 'svelte-i18n';
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';
  import { ChevronRight, Clock3, Ticket } from 'lucide-svelte';

  export let raffle: Raffle;
  export let ticketsOwned = 0;
  export let index = 0;
  export let eager = false;

  $: ticketsRemaining = Math.max(0, raffle.ticketCap - raffle.ticketsSold);
  $: daysLeft = Math.max(0, Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / 86_400_000));
  $: canEnter = raffle.status === 'open' && ticketsRemaining > 0;
</script>

<a
  href="/raffles/{raffle.id}"
  class="raffle-ticket tappable pressable flex items-stretch gap-3 rounded-[18px] bg-card p-2.5 text-inherit no-underline"
  in:fly={{ y: 8, duration: 220, delay: Math.min(index, 4) * 35, easing: cubicOut }}
  aria-label={$_('raffleCard.viewAria', { values: { title: raffle.title } })}
>
  <div class="relative h-[96px] w-[96px] shrink-0 overflow-hidden rounded-[14px] bg-[#DCE6FB]">
    <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="sm" fit="contain" {eager} />
  </div>

  <div class="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5">
    <div class="flex min-w-0 items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="line-clamp-1 font-sans text-[14px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink">{raffle.title}</h3>
        <p class="mt-0.5 truncate text-[10.5px] font-medium text-[#626878]">{raffle.prizeName}</p>
      </div>
      <ChevronRight size={16} strokeWidth={2.4} class="mt-0.5 shrink-0 text-dot-inactive" />
    </div>

    <div class="mt-1 flex items-baseline justify-between gap-2">
      <p class="font-sans text-[16px] font-extrabold leading-none tracking-[-0.015em] text-red">
        {formatEtb(raffle.ticketPrice)} <span class="text-[10px] font-bold text-red">ETB</span>
      </p>
      <span class="flex shrink-0 items-center gap-2 text-[9.5px] font-semibold text-[#626878]">
        <span class="flex items-center gap-0.5"><Ticket size={10} /> {$_('raffleCard.left', { values: { n: ticketsRemaining } })}</span>
        <span class="flex items-center gap-0.5"><Clock3 size={10} /> {$_('raffleCard.daysShort', { values: { n: daysLeft } })}</span>
      </span>
    </div>

    <p class="mt-1 text-[10px] font-extrabold text-primary-dark">
      {#if ticketsOwned > 0}{$_('raffleCard.ticketsOwned', { values: { n: ticketsOwned } })}{:else if canEnter}{$_('raffleCard.chooseTickets')}{:else}{$_('raffleCard.viewResult')}{/if}
    </p>
  </div>
</a>

<style>
  .raffle-ticket {
    border: 1px solid rgba(255, 255, 255, 0.86);
    box-shadow: 0 12px 28px -21px rgba(8, 14, 73, 0.42);
    transition: transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
  }

  .raffle-ticket:active {
    transform: scale(0.985);
    box-shadow: 0 6px 16px -14px rgba(8, 14, 73, 0.38);
  }

  @media (prefers-reduced-motion: reduce) {
    .raffle-ticket { transition-duration: 1ms; }
  }
</style>
