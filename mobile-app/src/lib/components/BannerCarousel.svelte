<script lang="ts">
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';
  import { ArrowRight, Clock3, Ticket } from 'lucide-svelte';

  export let raffles: Raffle[] = [];

  let trackEl: HTMLDivElement;
  let activeIndex = 0;

  function slides(): HTMLElement[] {
    return trackEl ? Array.from(trackEl.querySelectorAll<HTMLElement>('[data-carousel-slide]')) : [];
  }

  function handleScroll() {
    if (!trackEl) return;
    const trackCenter = trackEl.scrollLeft + trackEl.clientWidth / 2;
    const items = slides();
    if (items.length === 0) return;

    activeIndex = items.reduce((closestIndex, slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const closest = items[closestIndex];
      const closestCenter = closest.offsetLeft + closest.offsetWidth / 2;
      return Math.abs(slideCenter - trackCenter) < Math.abs(closestCenter - trackCenter) ? index : closestIndex;
    }, 0);
  }

  function goTo(index: number) {
    const slide = slides()[index];
    if (!trackEl || !slide) return;
    const centeredLeft = slide.offsetLeft - (trackEl.clientWidth - slide.offsetWidth) / 2;
    trackEl.scrollTo({ left: centeredLeft, behavior: 'smooth' });
  }

  function remaining(raffle: Raffle) {
    return Math.max(0, raffle.ticketCap - raffle.ticketsSold);
  }

  function soldPercentage(raffle: Raffle) {
    return raffle.ticketCap > 0 ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
  }

  function daysRemaining(raffle: Raffle) {
    return Math.max(0, Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / 86_400_000));
  }
</script>

{#if raffles.length > 0}
  <div class="flex flex-col gap-2.5">
    <div
      bind:this={trackEl}
      on:scroll={handleScroll}
      data-swipe-region
      class="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 [scroll-padding-inline:1rem] [touch-action:pan-x]"
    >
      {#each raffles as raffle, index (raffle.id)}
        <a
          href="/raffles/{raffle.id}"
          data-carousel-slide
          class="featured-ticket pressable relative flex h-[346px] shrink-0 snap-center flex-col overflow-hidden rounded-[24px] bg-card text-inherit no-underline {raffles.length === 1 ? 'w-full' : 'w-[calc(100%_-_2.75rem)]'}"
          aria-label="Enter {raffle.title}"
        >
          <div class="relative h-[166px] shrink-0 overflow-hidden bg-[#dff7ee]">
            <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="lg" fit="contain" eager={index === 0} />

            <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              <span class="live-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-white">
                <span class="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
                Open now
              </span>
              <span class="price-badge rounded-full px-3 py-1.5 text-[10px] font-extrabold text-white">
                {formatEtb(raffle.ticketPrice)} ETB <span class="font-medium text-white/75">/ ticket</span>
              </span>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col px-4 pb-3.5 pt-3">
            <div class="flex min-w-0 items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="line-clamp-2 font-sans text-[17px] font-extrabold leading-[1.15] tracking-[-0.025em] text-ink">{raffle.title}</h2>
                <p class="mt-1 truncate text-[11px] font-medium text-[#626878]">Win {raffle.prizeName}</p>
              </div>
              <span class="shrink-0 rounded-full bg-gold-bg px-2.5 py-1 text-[9px] font-extrabold text-[#815000]">{remaining(raffle)} left</span>
            </div>

            <div class="mt-auto">
              <div class="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold text-[#626878]">
                <span class="flex items-center gap-1"><Ticket size={11} /> {Math.round(soldPercentage(raffle))}% claimed</span>
                <span class="flex items-center gap-1"><Clock3 size={11} /> {daysRemaining(raffle)}d left</span>
              </div>
              <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-dot-inactive/80" aria-hidden="true">
                <div class="h-full rounded-full bg-primary-dark transition-[width] duration-500 ease-[var(--ease-out)]" style="width: {soldPercentage(raffle)}%"></div>
              </div>

              <span class="featured-cta inline-flex h-[52px] w-full items-center justify-between rounded-[16px] bg-primary px-4 text-[13px] font-extrabold text-[#10211d] shadow-[0_10px_22px_-14px_rgba(0,105,80,0.72),inset_0_1px_0_rgba(255,255,255,0.72)]">
                Choose 1–{raffle.maxTicketsPerUser} tickets
                <span class="flex h-8 w-8 items-center justify-center rounded-full bg-[#10211d] text-white"><ArrowRight size={17} strokeWidth={2.4} /></span>
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if raffles.length > 1}
      <div class="flex items-center justify-center gap-0.5" aria-label="Featured raffle pages">
        {#each raffles as raffle, i (raffle.id)}
          <button type="button" class="tappable pressable flex h-9 w-9 items-center justify-center rounded-full" aria-label="Show featured raffle {i + 1}" aria-current={i === activeIndex ? 'true' : undefined} on:click={() => goTo(i)}>
            <span class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === activeIndex ? 'w-5 bg-primary-dark' : 'w-1.5 bg-ink/15'}" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .featured-ticket {
    border: 1px solid rgba(255, 255, 255, 0.88);
    box-shadow: 0 18px 40px -25px rgba(17, 54, 44, 0.42), 0 5px 14px -10px rgba(17, 54, 44, 0.18);
    transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out);
  }

  .featured-ticket:active {
    transform: translateY(1px) scale(0.985);
    box-shadow: 0 8px 22px -17px rgba(17, 54, 44, 0.38);
  }

  .live-badge,
  .price-badge {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(16, 33, 29, 0.78);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(14px) saturate(1.12);
    -webkit-backdrop-filter: blur(14px) saturate(1.12);
  }

  @media (prefers-reduced-motion: reduce) {
    .featured-ticket { transition-duration: 1ms; }
  }
</style>
