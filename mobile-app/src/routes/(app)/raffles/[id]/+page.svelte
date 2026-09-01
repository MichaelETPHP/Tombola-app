<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import type { Raffle } from '$lib/stores/raffles.store.js';
  import Button from '$lib/components/Button.svelte';
  import PrizeImage from '$lib/components/PrizeImage.svelte';
  import RaffleDetailSkeleton from '$lib/components/RaffleDetailSkeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { openExternal } from '$lib/native/browser.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { CalendarClock, Check, ChevronLeft, Minus, Phone, Plus, ShieldCheck, Ticket, X } from 'lucide-svelte';
  import { resolveImageUrl } from '$lib/utils/imageUrl.js';

  const pullRefresh = getPullRefreshContext();
  let raffle: Raffle | null = null;
  let loading = true;
  let quantity = 1;
  let purchasing = false;
  let error = '';
  let resumedFromAuth = false;
  let agreedToTerms = false;
  let termsOpen = false;
  let termsShake = false;

  const rankBg = ['bg-gold-bg', 'bg-blue-bg', 'bg-pink-bg'];
  const rankText = ['text-gold', 'text-blue', 'text-pink'];
  const rankWord = ['1st', '2nd', '3rd'];

  // Prize carousel — auto-advances like a marquee for passive viewing, but
  // hands control to the user the instant they touch it (never fights a
  // manual swipe mid-gesture).
  let carouselEl: HTMLDivElement;
  let carouselIndex = 0;
  let autoAdvanceTimer: ReturnType<typeof setInterval> | undefined;

  function handleCarouselScroll() {
    if (!carouselEl) return;
    const w = carouselEl.clientWidth;
    if (w === 0) return;
    carouselIndex = Math.round(carouselEl.scrollLeft / w);
  }
  function goToCarousel(i: number) {
    carouselEl?.scrollTo({ left: i * carouselEl.clientWidth, behavior: 'smooth' });
  }
  function stopAutoAdvance() {
    clearInterval(autoAdvanceTimer);
    autoAdvanceTimer = undefined;
  }
  function startAutoAdvance() {
    stopAutoAdvance();
    if (rankedPrizes.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    autoAdvanceTimer = setInterval(() => goToCarousel((carouselIndex + 1) % rankedPrizes.length), 2800);
  }

  function goBack() {
    hapticLight();
    navigateBack();
  }

  async function fetchRaffle() {
    try {
      const response = await api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, { skipAuth: true });
      raffle = response.raffle;
      error = '';
    } catch {
      error = 'Could not load this raffle.';
    }
  }

  onMount(async () => {
    await fetchRaffle();
    const pending = getPendingPurchase();
    if (pending && raffle && pending.raffleId === raffle.id) {
      quantity = Math.min(pending.quantity, raffle.maxTicketsPerUser, 5);
      resumedFromAuth = $auth.isAuthenticated;
    }
    loading = false;
    pullRefresh.set(fetchRaffle);
    startAutoAdvance();
  });

  onDestroy(stopAutoAdvance);

  function handleBuyClick() {
    if (!agreedToTerms) {
      termsShake = false;
      requestAnimationFrame(() => (termsShake = true));
      hapticLight();
      return;
    }
    purchase();
  }

  function apiMessage(cause: ApiError): string {
    try {
      const body = JSON.parse(cause.body) as { error?: string };
      return body.error || 'Purchase failed. Please try again.';
    } catch {
      return 'Purchase failed. Please try again.';
    }
  }

  async function purchase() {
    if (!raffle || !agreedToTerms) return;
    hapticMedium();
    if (!$auth.isAuthenticated) {
      setPendingPurchase({ raffleId: raffle.id, quantity });
      goto(`/login?returnTo=${encodeURIComponent(`/raffles/${raffle.id}`)}`);
      return;
    }
    error = '';
    purchasing = true;
    try {
      const result = await api.post<{ paymentId: string; checkoutUrl?: string }>(
        `/raffles/${raffle.id}/tickets`,
        { quantity, paymentGateway: 'chapa' }
      );
      if (!result.checkoutUrl) throw new Error('No checkout URL returned');
      clearPendingPurchase();
      const { opensSeparately } = await openExternal(result.checkoutUrl);
      if (opensSeparately) goto(`/payments/${result.paymentId}`);
    } catch (cause) {
      error = cause instanceof ApiError ? apiMessage(cause) : 'Network error. Check your connection and try again.';
    } finally {
      purchasing = false;
    }
  }

  // Ticket availability still gates purchasing internally — just never
  // rendered as a "N left" figure per the no-scarcity-numbers direction.
  $: ticketsRemaining = raffle ? Math.max(0, raffle.ticketCap - raffle.ticketsSold) : 0;
  $: maxAllowed = raffle ? Math.max(1, Math.min(5, raffle.maxTicketsPerUser, ticketsRemaining || 1)) : 5;
  $: odds = raffle && raffle.ticketsSold + quantity > 0 ? (quantity / (raffle.ticketsSold + quantity)) * 100 : 0;
  $: oddsDisplay = odds === 0 ? '0%' : odds < 0.1 ? '<0.1%' : `${odds.toFixed(1)}%`;
  $: rankedPrizes = raffle?.prizes && raffle.prizes.length > 1 ? [...raffle.prizes].sort((a, b) => a.tier - b.tier) : [];
</script>

<svelte:head><title>{raffle?.title ?? 'Raffle'} · Tombola</title></svelte:head>

{#if loading}
  <RaffleDetailSkeleton />
{:else if !raffle}
  <section class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
    <button type="button" aria-label="Back" on:click={goBack} class="tappable pressable flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-card-light"><ChevronLeft size={22} /></button>
    <div><h1 class="text-lg font-extrabold text-ink">Raffle unavailable</h1><p class="mt-1 text-xs text-muted">{error || 'This raffle could not be found.'}</p></div>
  </section>
{:else}
  <article class="raffle-screen">
    <section class="raffle-cover relative min-h-0 overflow-hidden rounded-[26px] bg-card shadow-[0_12px_30px_rgba(20,89,72,0.10)]">
      <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="lg" eager />
      <div class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#152521]/45 to-transparent"></div>
      <button type="button" aria-label="Back" on:click={goBack} class="tappable pressable absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-[#172c27]/55 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md"><ChevronLeft size={19} /></button>
    </section>

    <header class="min-w-0 px-0.5">
      <h1 class="truncate text-[19px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{raffle.title}</h1>
      {#if rankedPrizes.length <= 1}<p class="mt-1 truncate text-[11px] text-muted">{raffle.prizeName}</p>{/if}
      {#if raffle.description}<p class="raffle-description mt-2 line-clamp-2 text-[11px] leading-[1.55] text-ink/75">{raffle.description}</p>{/if}
    </header>

    {#if rankedPrizes.length > 1}
      <div class="prize-carousel shrink-0">
        <div
          bind:this={carouselEl}
          on:scroll={handleCarouselScroll}
          on:touchstart={stopAutoAdvance}
          data-swipe-region
          role="presentation"
          class="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl [touch-action:pan-x]"
        >
          {#each rankedPrizes as prize, i (prize.id)}
            <div class="flex w-full shrink-0 snap-start items-center gap-3 bg-bg-start/70 px-3.5 py-2.5">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full {rankBg[i] ?? 'bg-action-bg'}">
                {#if prize.imageUrl}
                  <img src={resolveImageUrl(prize.imageUrl)} alt={prize.name} class="h-full w-full object-cover" />
                {:else}
                  <span class="text-[10px] font-black {rankText[i] ?? 'text-primary-dark'}">{rankWord[i] ?? `${prize.tier}th`}</span>
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[9px] font-bold uppercase tracking-[0.07em] text-muted">{rankWord[i] ?? `${prize.tier}th`} place</p>
                <p class="truncate text-[13.5px] font-bold text-ink">{prize.name}</p>
              </div>
            </div>
          {/each}
        </div>
        <div class="mt-1.5 flex items-center justify-center gap-1.5" aria-label="Prize pages">
          {#each rankedPrizes as prize, i (prize.id)}
            <button
              type="button"
              class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === carouselIndex ? 'w-5 bg-primary-dark' : 'w-1.5 bg-dot-inactive'}"
              aria-label="Show {rankWord[i] ?? `${prize.tier}th`} place prize"
              aria-current={i === carouselIndex ? 'true' : undefined}
              on:click={() => { stopAutoAdvance(); goToCarousel(i); }}
            ></button>
          {/each}
        </div>
      </div>
    {/if}

    <section class="ticket-sheet overflow-hidden rounded-[24px] bg-card shadow-[0_10px_26px_rgba(24,95,77,0.08)]">
      <div class="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3.5">
        <div><p class="text-[9px] font-bold uppercase tracking-[0.11em] text-muted">Price</p><p class="mt-1 text-sm font-extrabold text-ink">{formatEtb(raffle.ticketPrice)} <span class="text-[10px] text-muted">ETB</span></p></div>
        <div class="h-8 w-px bg-dot-inactive"></div>
        <div class="text-right"><p class="text-[9px] font-bold uppercase tracking-[0.11em] text-muted">Chance with {quantity}</p><p class="mt-1 text-sm font-extrabold text-primary-dark">{oddsDisplay}</p></div>
      </div>

      <div class="ticket-perforation"></div>
      {#if raffle.status === 'open' && ticketsRemaining > 0}
        <div class="raffle-actions px-4 pb-3.5 pt-3">
          <div class="flex items-center justify-between gap-4">
            <div><p class="text-xs font-bold text-ink">Choose tickets</p><p class="mt-0.5 text-[9px] text-muted">1–{maxAllowed} per participant{resumedFromAuth ? ' · ready to continue' : ''}</p></div>
            <div class="flex items-center gap-3 rounded-full bg-bg-start p-1">
              <button type="button" aria-label="Remove one ticket" disabled={quantity <= 1} class="tappable pressable flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary-dark shadow-card-light disabled:opacity-35" on:click={() => { quantity = Math.max(1, quantity - 1); hapticLight(); }}><Minus size={15} /></button>
              <span class="min-w-5 text-center text-base font-extrabold text-ink">{quantity}</span>
              <button type="button" aria-label="Add one ticket" disabled={quantity >= maxAllowed} class="tappable pressable flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary-dark shadow-card-light disabled:opacity-35" on:click={() => { quantity = Math.min(maxAllowed, quantity + 1); hapticLight(); }}><Plus size={15} /></button>
            </div>
          </div>

          {#if error}<p class="mt-2 rounded-xl bg-pink-bg px-3 py-2 text-center text-[10px] font-semibold text-pink" role="alert">{error}</p>{/if}
          <div class="mt-3"><Button variant="glass" loading={purchasing} on:click={handleBuyClick}><Ticket size={15} /> Buy {quantity} ticket{quantity > 1 ? 's' : ''} · {formatEtb(quantity * Number(raffle.ticketPrice))} ETB</Button></div>

          <div class="mt-2.5 flex items-center justify-center gap-2">
            <button type="button" role="checkbox" aria-checked={agreedToTerms} aria-label="Agree to Terms and Conditions" on:click={() => (agreedToTerms = !agreedToTerms)} on:animationend={() => (termsShake = false)} class="tappable pressable flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border {agreedToTerms ? 'border-primary-dark/45 bg-action-bg' : termsShake ? 'border-pink bg-pink-bg' : 'border-dot-inactive bg-card'} {termsShake ? 'terms-shake' : ''}">{#if agreedToTerms}<Check size={12} class="text-primary-dark" strokeWidth={3.5} />{/if}</button>
            <p class="text-[9.5px] text-muted">I agree to the <button type="button" class="tappable font-bold text-primary-dark underline underline-offset-2" on:click={() => (termsOpen = true)}>Terms and Conditions</button></p>
          </div>
          <p class="mt-2 flex items-center justify-center gap-1.5 text-center text-[9px] text-muted">{#if !$auth.isAuthenticated}<Phone size={10} /> Sign in by SMS before payment{:else}<ShieldCheck size={10} /> Numbers are issued after payment confirmation{/if}</p>
        </div>
      {:else}
        <div class="flex items-center gap-3 px-4 py-4 text-xs text-muted"><CalendarClock size={17} class="shrink-0 text-primary-dark" /><span>This raffle is {raffle.status.replace('_', ' ')}. Ticket sales are closed.</span></div>
      {/if}
    </section>
  </article>
{/if}

{#if termsOpen}
  <button type="button" class="fixed inset-0 z-40 cursor-default bg-[#152521]/45" aria-label="Close" on:click={() => (termsOpen = false)} transition:fade={{ duration: 160 }}></button>
  <section class="no-scrollbar fixed inset-x-5 top-1/2 z-50 max-h-[70dvh] -translate-y-1/2 overflow-y-auto overscroll-y-contain rounded-card bg-card p-5 shadow-card" transition:scale={{ duration: 180, start: 0.95, opacity: 0, easing: cubicOut }}>
    <div class="mb-3 flex items-center justify-between"><h2 class="text-[15px] font-extrabold text-ink">Terms and Conditions</h2><button type="button" aria-label="Close" class="tappable pressable flex h-8 w-8 items-center justify-center rounded-full bg-bg-start text-primary-dark" on:click={() => (termsOpen = false)}><X size={16} /></button></div>
    <ul class="flex flex-col gap-2.5 text-[12px] leading-snug text-muted"><li>You must be 18 or older to purchase tickets.</li><li>Purchases are final after payment confirmation.</li><li>Each paid ticket is one independent chance in the draw.</li><li>The maximum is five tickets per participant in one raffle.</li><li>The published fairness proof can be verified after the draw.</li></ul>
    <div class="mt-4"><Button size="md" on:click={() => (termsOpen = false)}>Understood</Button></div>
  </section>
{/if}

<style>
  .raffle-screen { display: flex; height: calc(100dvh - max(44px, var(--safe-top)) - 120px); min-height: 0; flex-direction: column; gap: 10px; overflow: hidden; }
  .raffle-cover { flex: 1 1 32%; }
  .prize-carousel { flex: 0 0 auto; }
  .ticket-sheet { flex: 0 0 auto; }
  .terms-shake { animation: terms-shake 380ms var(--ease-out); }
  @keyframes terms-shake { 20%, 60% { transform: translateX(-3px); } 40%, 80% { transform: translateX(3px); } }
  @media (max-height: 720px) { .raffle-screen { gap: 7px; } .raffle-cover { flex-basis: 25%; } .raffle-description { display: none; } .raffle-actions { padding-top: 8px; padding-bottom: 8px; } }
  @media (max-height: 630px) { .raffle-cover { min-height: 82px; } .raffle-screen header p { display: none; } .prize-carousel { display: none; } }
  @media (prefers-reduced-motion: reduce) { .terms-shake { animation: none; } }
</style>
