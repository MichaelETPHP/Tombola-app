<script lang="ts">
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';
  import { ArrowRight, Ticket } from 'lucide-svelte';

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
</script>

{#if raffles.length > 0}
  <div class="flex flex-col gap-3">
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
          class="featured-slide tappable pressable relative flex h-[258px] shrink-0 snap-center overflow-hidden rounded-[22px] bg-[#d9f5e9] no-underline shadow-card {raffles.length === 1 ? 'w-[calc(100%-2rem)]' : 'w-[calc(100%-3rem)]'}"
          aria-label="Enter {raffle.title}"
        >
          <div class="absolute inset-0">
            <PrizeImage
              src={raffle.prizeImageUrl}
              title={raffle.title}
              prizeName={raffle.prizeName}
              size="lg"
              fit="contain"
              eager={index === 0}
            />
          </div>

          <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#111917]/95 via-[#111917]/58 to-transparent"></div>

          <div class="relative flex w-full flex-col justify-between p-3.5 text-white">
            <div class="flex items-start justify-between gap-2.5">
              <span class="rounded-full border border-white/25 bg-[#15211e]/55 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md">
                Open now
              </span>
              <span class="rounded-full border border-white/25 bg-[#15211e]/55 px-3 py-1.5 text-[10px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md">
                {formatEtb(raffle.ticketPrice)} ETB / ticket
              </span>
            </div>

            <div class="flex flex-col gap-2.5">
              <div class="min-w-0 px-0.5">
                <p class="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-white/78">
                  <Ticket size={12} strokeWidth={2} /> {remaining(raffle)} tickets remaining
                </p>
                <h2 class="line-clamp-2 max-w-[94%] font-sans text-[19px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">
                  {raffle.title}
                </h2>
              </div>

              <span class="featured-cta inline-flex h-[52px] w-full items-center justify-between rounded-[17px] border border-white/45 bg-primary/88 px-4 text-[14px] font-extrabold text-[#10211d] shadow-[0_10px_24px_-14px_rgba(0,68,53,0.8),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl">
                Choose 1–5 tickets
                <span class="flex h-8 w-8 items-center justify-center rounded-full border border-[#10211d]/10 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]">
                  <ArrowRight size={18} strokeWidth={2.25} />
                </span>
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>

    {#if raffles.length > 1}
      <div class="flex items-center justify-center gap-2" aria-label="Featured raffle pages">
        {#each raffles as raffle, i (raffle.id)}
          <button
            type="button"
            class="tappable pressable flex h-11 w-11 items-center justify-center rounded-full"
            aria-label="Show featured raffle {i + 1}"
            aria-current={i === activeIndex ? 'true' : undefined}
            on:click={() => goTo(i)}
          >
            <span
              class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === activeIndex
                ? 'w-6 bg-primary-dark'
                : 'w-1.5 bg-dot-inactive'}"
              aria-hidden="true"
            ></span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .featured-slide {
    transition:
      transform 220ms var(--ease-out),
      opacity 220ms var(--ease-out);
  }

  .featured-slide:active {
    transform: scale(0.985);
  }

  .featured-cta {
    backdrop-filter: blur(18px) saturate(1.12);
    -webkit-backdrop-filter: blur(18px) saturate(1.12);
  }

  @media (prefers-reduced-motion: reduce) {
    .featured-slide {
      transition-duration: 1ms;
    }
  }
</style>
