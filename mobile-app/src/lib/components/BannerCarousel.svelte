<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';

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

</script>

{#if raffles.length > 0}
  <div class="flex flex-col gap-2.5">
    <div
      bind:this={trackEl}
      on:scroll={handleScroll}
      data-swipe-region
      class="carousel-track no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 [scroll-padding-inline:1rem]"
    >
      {#each raffles as raffle, index (raffle.id)}
        <a
          href="/raffles/{raffle.id}"
          data-carousel-slide
          class="featured-ticket pressable relative flex shrink-0 snap-center flex-col overflow-hidden rounded-[24px] bg-card text-inherit no-underline {raffles.length === 1 ? 'w-full' : 'w-[calc(100%_-_2.75rem)]'}"
          aria-label={$_('banner.enterAria', { values: { title: raffle.title } })}
        >
          <div class="raffle-artwork relative w-full shrink-0 overflow-hidden bg-[#DCE6FB]">
            <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="lg" fit="cover" eager={index === 0} />
          </div>

          <div class="featured-info relative flex flex-col gap-1 px-4 py-4">
            <p class="relative z-10 line-clamp-1 text-[12px] font-semibold text-white/75">{raffle.title}</p>
            <p class="relative z-10 text-[26px] font-extrabold leading-none tracking-[-0.02em] text-white">
              {formatEtb(raffle.ticketPrice)} <span class="text-[13px] font-semibold text-white/70">ETB {$_('banner.perTicket')}</span>
            </p>
            <p class="relative z-10 mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              <span class="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true"></span>
              {$_('banner.openNow')}
            </p>
          </div>
        </a>
      {/each}
    </div>

    {#if raffles.length > 1}
      <div class="flex items-center justify-center gap-0.5" aria-label={$_('banner.pagesAria')}>
        {#each raffles as raffle, i (raffle.id)}
          <button type="button" class="tappable pressable flex h-9 w-9 items-center justify-center rounded-full" aria-label={$_('banner.showPageAria', { values: { n: i + 1 } })} aria-current={i === activeIndex ? 'true' : undefined} on:click={() => goTo(i)}>
            <span class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === activeIndex ? 'w-5 bg-primary-dark' : 'w-1.5 bg-ink/15'}" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .carousel-track {
    /* Let the WebView lock each gesture to its natural direction: horizontal
       drags move the carousel, while vertical drags continue scrolling the
       Home page even when the finger starts directly on the artwork. */
    touch-action: pan-x pan-y;
    -webkit-overflow-scrolling: touch;
  }

  .featured-ticket {
    border: 1px solid rgba(255, 255, 255, 0.88);
    box-shadow: 0 18px 40px -25px rgba(8, 14, 73, 0.42), 0 5px 14px -10px rgba(8, 14, 73, 0.18);
    transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out);
  }

  .raffle-artwork {
    aspect-ratio: var(--raffle-artwork-ratio);
  }

  .featured-ticket:active {
    transform: translateY(1px) scale(0.985);
    box-shadow: 0 8px 22px -17px rgba(8, 14, 73, 0.38);
  }

  /* The one authored flourish on this card: two soft light blooms bleeding
     in from the right, echoing the prize photo's warmth against the brand
     gradient without competing with the price for attention. */
  .featured-info {
    overflow: hidden;
    background: linear-gradient(135deg, #0135c6 0%, #114ad4 55%, #2f66e6 100%);
  }

  .featured-info::before,
  .featured-info::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }

  .featured-info::before {
    top: -46px;
    right: -22px;
    width: 130px;
    height: 130px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.24), transparent 72%);
  }

  .featured-info::after {
    bottom: -58px;
    right: 34px;
    width: 100px;
    height: 100px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.14), transparent 72%);
  }

  @media (prefers-reduced-motion: reduce) {
    .featured-ticket { transition-duration: 1ms; }
  }
</style>
