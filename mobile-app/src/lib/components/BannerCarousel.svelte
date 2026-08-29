<script lang="ts">
  import type { Raffle } from '../stores/raffles.store.js';
  import PrizeImage from './PrizeImage.svelte';
  import { formatEtb } from '../utils/currency.js';
  import { ArrowRight, Ticket } from 'lucide-svelte';

  export let raffles: Raffle[] = [];

  let trackEl: HTMLDivElement;
  let activeIndex = 0;

  function handleScroll() {
    if (!trackEl) return;
    const slideWidth = trackEl.clientWidth;
    if (slideWidth === 0) return;
    activeIndex = Math.round(trackEl.scrollLeft / slideWidth);
  }

  function goTo(index: number) {
    trackEl?.scrollTo({ left: index * trackEl.clientWidth, behavior: 'smooth' });
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
      class="flex snap-x snap-mandatory overflow-x-auto rounded-card"
    >
      {#each raffles as raffle (raffle.id)}
        <a
          href="/raffles/{raffle.id}"
          class="tappable pressable relative flex h-[238px] w-full shrink-0 snap-start overflow-hidden rounded-card bg-[#202725] no-underline shadow-card"
          aria-label="Enter {raffle.title}"
        >
          <div class="absolute inset-0">
            <PrizeImage
              src={raffle.prizeImageUrl}
              title={raffle.title}
              prizeName={raffle.prizeName}
              size="lg"
              eager
            />
          </div>

          <div class="absolute inset-0 bg-gradient-to-t from-[#151b1a]/95 via-[#151b1a]/35 to-[#151b1a]/15"></div>

          <div class="relative flex w-full flex-col justify-between p-4 text-white">
            <div class="flex items-center justify-between gap-3">
              <span class="rounded-full border border-white/20 bg-[#151b1a]/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur-md">
                Open now
              </span>
              <span class="rounded-full border border-white/20 bg-[#151b1a]/55 px-3 py-1.5 text-[11px] font-semibold backdrop-blur-md">
                {formatEtb(raffle.ticketPrice)} ETB / ticket
              </span>
            </div>

            <div class="flex flex-col gap-3">
              <div class="max-w-[88%]">
                <p class="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-white/75">
                  <Ticket size={13} strokeWidth={2} /> {remaining(raffle)} tickets remaining
                </p>
                <h2 class="font-sans text-[24px] font-extrabold leading-[1.08] tracking-[-0.035em] text-white">
                  {raffle.title}
                </h2>
              </div>

              <span class="inline-flex h-11 w-full items-center justify-between rounded-button bg-primary px-4 text-sm font-bold text-[#10211d] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                Choose 1–5 tickets
                <ArrowRight size={18} strokeWidth={2.25} />
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
            class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === activeIndex
              ? 'w-6 bg-primary-dark'
              : 'w-1.5 bg-dot-inactive'}"
            aria-label="Show featured raffle {i + 1}"
            aria-current={i === activeIndex ? 'true' : undefined}
            on:click={() => goTo(i)}
          ></button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
