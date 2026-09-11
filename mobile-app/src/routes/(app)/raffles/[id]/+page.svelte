<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import { raffles, type Raffle } from '$lib/stores/raffles.store.js';
  import Button from '$lib/components/Button.svelte';
  import PrizeImage from '$lib/components/PrizeImage.svelte';
  import RaffleDetailSkeleton from '$lib/components/RaffleDetailSkeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { openCheckout, paymentReturnTarget } from '$lib/native/browser.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { CalendarClock, Check, ChevronLeft, Info, Minus, Phone, Plus, ShieldCheck, Ticket, X } from 'lucide-svelte';
  import { resolveImageUrl } from '$lib/utils/imageUrl.js';

  const pullRefresh = getPullRefreshContext();
  // Instant paint for the single most common navigation in the app —
  // tapping a raffle card. The Home/Raffles-list pages already fetched
  // this exact raffle into the shared store moments ago; reuse it as the
  // first paint instead of showing a skeleton and re-fetching from zero,
  // then quietly refetch below to reconcile anything that changed since
  // (ticketsSold, status) without ever flashing a loading state.
  let raffle: Raffle | null = get(raffles).find((r) => r.id === $page.params.id) ?? null;
  let loading = !raffle;
  let quantity = 1;
  let purchasing = false;
  let purchaseStage: 'reserving' | 'opening' = 'reserving';
  let error = '';
  let resumedFromAuth = false;
  let agreedToTerms = false;
  let termsOpen = false;
  let termsShake = false;
  let pageVisible = true;
  let descEl: HTMLParagraphElement | undefined;
  let descExpanded = false;
  let descOverflowing = false;

  async function checkDescOverflow() {
    await tick();
    descOverflowing = !!descEl && descEl.scrollHeight - descEl.clientHeight > 1;
  }
  $: if (raffle?.description) checkDescOverflow();

  const rankBg = ['bg-gold-bg', 'bg-blue-bg', 'bg-pink-bg'];
  const rankText = ['text-gold', 'text-blue', 'text-pink'];
  // English needs real ordinal suffixes (1st/2nd/3rd); Amharic doesn't
  // inflect the same way, so this is an ICU selectordinal message for 'en'
  // and a plain "{tier}ኛ" for 'am' — see en.json/am.json's raffle.ordinal.
  const ordinal = (tier: number) => $_('raffle.ordinal', { values: { tier } });

  // Prize carousel — auto-advances like a marquee for passive viewing, but
  // hands control to the user the instant they touch it (never fights a
  // manual swipe mid-gesture).
  let carouselEl: HTMLDivElement;
  let carouselIndex = 0;
  let autoAdvanceTimer: ReturnType<typeof setInterval> | undefined;
  let autoResumeTimer: ReturnType<typeof setTimeout> | undefined;

  function handleCarouselScroll() {
    if (!carouselEl) return;
    const w = carouselEl.clientWidth;
    if (w === 0) return;
    carouselIndex = Math.round(carouselEl.scrollLeft / w);
  }
  function goToCarousel(i: number) {
    if (!carouselEl || rankedPrizes.length <= 1) return;
    carouselIndex = ((i % rankedPrizes.length) + rankedPrizes.length) % rankedPrizes.length;
    carouselEl.scrollTo({ left: carouselIndex * carouselEl.clientWidth, behavior: 'smooth' });
  }
  function stopAutoAdvance() {
    clearInterval(autoAdvanceTimer);
    clearTimeout(autoResumeTimer);
    autoAdvanceTimer = undefined;
    autoResumeTimer = undefined;
  }
  function startAutoAdvance() {
    stopAutoAdvance();
    if (rankedPrizes.length <= 1) return;
    if (lightboxIndex !== null || !pageVisible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    autoAdvanceTimer = setInterval(() => goToCarousel((carouselIndex + 1) % rankedPrizes.length), 2000);
  }
  function resumeAutoAdvance() {
    clearTimeout(autoResumeTimer);
    autoResumeTimer = setTimeout(startAutoAdvance, 2000);
  }

  function goBack() {
    hapticLight();
    navigateBack();
  }

  // Full-image lightbox — opened by tapping a prize thumbnail. Swiping
  // inside it pages between prizes (same snap-carousel mechanics as the
  // thumbnail row), and closing syncs the thumbnail row back to whichever
  // prize was last shown so the two views never disagree.
  let lightboxEl: HTMLDivElement;
  let lightboxIndex: number | null = null;

  function scrollToIndexInstant(node: HTMLDivElement, index: number) {
    node.scrollLeft = index * node.clientWidth;
    return {};
  }
  function handleLightboxScroll() {
    if (!lightboxEl) return;
    const w = lightboxEl.clientWidth;
    if (w === 0) return;
    lightboxIndex = Math.round(lightboxEl.scrollLeft / w);
  }
  function openLightbox(i: number) {
    if (!rankedPrizes[i]?.imageUrl) return;
    hapticLight();
    stopAutoAdvance();
    lightboxIndex = i;
  }
  function closeLightbox() {
    if (lightboxIndex !== null && carouselEl) {
      carouselIndex = lightboxIndex;
      carouselEl.scrollTo({ left: lightboxIndex * carouselEl.clientWidth, behavior: 'auto' });
    }
    lightboxIndex = null;
    resumeAutoAdvance();
  }
  function lightboxContentParams() {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { duration: 220, start: reduced ? 1 : 0.95, opacity: 0, easing: cubicOut };
  }
  function handleWindowKeydown(e: KeyboardEvent) {
    if (lightboxIndex !== null && e.key === 'Escape') closeLightbox();
  }

  function handleVisibilityChange() {
    pageVisible = !document.hidden;
    if (pageVisible) startAutoAdvance();
    else stopAutoAdvance();
  }

  async function fetchRaffle() {
    try {
      const response = await api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, { skipAuth: true });
      raffle = response.raffle;
      error = '';
    } catch {
      // A failed background revalidation shouldn't blow away a perfectly
      // good cached view — only surface the error when there's nothing
      // on screen yet.
      if (!raffle) error = $_('raffle.loadError');
    }
  }

  onMount(async () => {
    document.documentElement.classList.add('raffle-detail-lock');
    pageVisible = !document.hidden;
    document.addEventListener('visibilitychange', handleVisibilityChange);

    pullRefresh.set(fetchRaffle);
    const hadCachedRaffle = !!raffle;
    if (hadCachedRaffle) {
      loading = false;
      await tick();
      startAutoAdvance();
      fetchRaffle(); // silent revalidation, not awaited — content is already on screen
    } else {
      await fetchRaffle();
      loading = false;
      await tick();
      startAutoAdvance();
    }
    const pending = getPendingPurchase();
    if (pending && raffle && pending.raffleId === raffle.id) {
      quantity = Math.min(pending.quantity, raffle.maxTicketsPerUser, 4);
      resumedFromAuth = $auth.isAuthenticated;
    }
  });

  onDestroy(() => {
    stopAutoAdvance();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.documentElement.classList.remove('raffle-detail-lock');
    }
  });

  function handleBuyClick() {
    if (!agreedToTerms) {
      termsShake = false;
      requestAnimationFrame(() => (termsShake = true));
      hapticLight();
      return;
    }
    purchase();
  }

  function purchase() {
    if (!raffle || !agreedToTerms) return;
    hapticMedium();
    goto(`/raffles/${raffle.id}/numbers`);
  }

  // Ticket availability still gates purchasing internally — just never
  // rendered as a "N left" figure per the no-scarcity-numbers direction.
  $: ticketsRemaining = raffle ? Math.max(0, raffle.ticketCap - raffle.ticketsSold) : 0;
  $: maxAllowed = raffle ? Math.max(1, Math.min(4, raffle.maxTicketsPerUser, ticketsRemaining || 1)) : 4;
  $: odds = raffle && raffle.ticketsSold + quantity > 0 ? (quantity / (raffle.ticketsSold + quantity)) * 100 : 0;
  $: oddsDisplay = odds === 0 ? '0%' : odds < 0.1 ? '<0.1%' : `${odds.toFixed(1)}%`;
  $: rankedPrizes = raffle?.prizes && raffle.prizes.length > 1 ? [...raffle.prizes].sort((a, b) => a.tier - b.tier) : [];
</script>

<svelte:head><title>{raffle?.title ?? $_('raffle.pageTitleFallback')} · YeneEta</title></svelte:head>
<svelte:window on:keydown={handleWindowKeydown} />

{#if loading}
  <RaffleDetailSkeleton />
{:else if !raffle}
  <section class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
    <button type="button" aria-label={$_('raffle.backAria')} on:click={goBack} class="tappable pressable flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-card-light"><ChevronLeft size={22} /></button>
    <div><h1 class="text-lg font-extrabold text-ink">{$_('raffle.unavailableTitle')}</h1><p class="mt-1 text-xs text-muted">{error || $_('raffle.notFoundError')}</p></div>
  </section>
{:else}
  <article class="raffle-screen">
    <section class="raffle-cover relative min-h-0 overflow-hidden rounded-[26px] bg-[#dff7ee] shadow-[0_12px_30px_rgba(20,89,72,0.10)]">
      <PrizeImage src={raffle.prizeImageUrl} title={raffle.title} prizeName={raffle.prizeName} size="lg" fit="contain" eager />
      <div class="prize-glass-flash pointer-events-none absolute inset-y-0 left-0 w-[38%] {pageVisible ? '' : 'is-paused'}" aria-hidden="true"></div>
      <div class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#152521]/45 to-transparent"></div>
      <button type="button" aria-label={$_('raffle.backAria')} on:click={goBack} class="tappable pressable absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-card-light"><ChevronLeft size={20} /></button>
    </section>

    <header class="min-w-0 px-0.5">
      <h1 class="truncate text-[19px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{raffle.title}</h1>
      {#if rankedPrizes.length <= 1}<p class="mt-1 truncate text-[11px] text-muted">{raffle.prizeName}</p>{/if}
      {#if raffle.description}
        <div class="raffle-description mt-2">
          <p bind:this={descEl} class="text-[13px] leading-[1.55] text-ink/75" class:line-clamp-5={!descExpanded}>{raffle.description}</p>
          {#if descOverflowing}
            <button type="button" class="tappable mt-0.5 text-[11px] font-bold text-primary-dark" on:click={() => { hapticLight(); descExpanded = !descExpanded; }}>
              {descExpanded ? $_('raffle.readLess') : $_('raffle.readMore')}
            </button>
          {/if}
        </div>
      {/if}
    </header>

    {#if rankedPrizes.length > 1}
      <div class="prize-carousel shrink-0">
        <div
          bind:this={carouselEl}
          on:scroll={handleCarouselScroll}
          on:touchstart={stopAutoAdvance}
          on:touchend={resumeAutoAdvance}
          on:touchcancel={resumeAutoAdvance}
          on:focusin={stopAutoAdvance}
          on:focusout={resumeAutoAdvance}
          data-swipe-region
          role="region"
          aria-label={$_('raffle.prizeTiersAria')}
          class="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl [touch-action:pan-x]"
        >
          {#each rankedPrizes as prize, i (prize.id)}
            <div role="group" aria-label={$_('raffle.prizeTierGroupAria', { values: { ordinal: ordinal(prize.tier), n: i + 1, total: rankedPrizes.length } })} class="flex h-16 w-full shrink-0 snap-start items-center gap-3 bg-bg-start/70 px-3.5 py-2.5">
              <button
                type="button"
                class="tappable pressable flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full {rankBg[i] ?? 'bg-action-bg'} {prize.imageUrl ? '' : 'cursor-default'}"
                aria-label={prize.imageUrl ? $_('raffle.viewPrizePhotoAria', { values: { ordinal: ordinal(prize.tier) } }) : $_('raffle.placeLabel', { values: { ordinal: ordinal(prize.tier) } })}
                on:click={() => openLightbox(i)}
              >
                {#if prize.imageUrl}
                  <img src={resolveImageUrl(prize.imageUrl)} alt={prize.name} class="h-full w-full object-contain" />
                {:else}
                  <span class="text-[10px] font-black {rankText[i] ?? 'text-primary-dark'}">{ordinal(prize.tier)}</span>
                {/if}
              </button>
              <div class="min-w-0 flex-1">
                <p class="text-[9px] font-bold uppercase tracking-[0.07em] text-muted">{$_('raffle.placeLabel', { values: { ordinal: ordinal(prize.tier) } })}</p>
                <p class="truncate text-[13.5px] font-bold text-ink">{prize.name}</p>
              </div>
              <span class="shrink-0 rounded-full bg-card/80 px-2 py-1 text-[9px] font-extrabold tabular-nums text-primary-dark" aria-hidden="true">
                {i + 1}/{rankedPrizes.length}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <section class="ticket-sheet overflow-hidden rounded-[24px] bg-card shadow-[0_10px_26px_rgba(24,95,77,0.08)]">
      <div class="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3.5">
        <div><p class="text-[9px] font-bold uppercase tracking-[0.11em] text-muted">{$_('raffle.price')}</p><p class="mt-1 text-sm font-extrabold text-ink">{formatEtb(raffle.ticketPrice)} <span class="text-[10px] text-muted">ETB</span></p></div>
        <div class="h-8 w-px bg-dot-inactive"></div>
        <div class="text-right"><p class="text-[9px] font-bold uppercase tracking-[0.11em] text-muted">{$_('raffle.yourChoice')}</p><p class="mt-1 text-sm font-extrabold text-ink">{$_('raffle.upToTickets', { values: { n: raffle.maxTicketsPerUser } })}</p></div>
      </div>

      <div class="ticket-perforation"></div>
      {#if raffle.status === 'open' && ticketsRemaining > 0 && raffle.salesEnabled !== false && !raffle.isDemo}
        <div class="raffle-actions px-4 pb-3.5 pt-3">
          {#if error}<p class="mt-2 rounded-xl bg-pink-bg px-3 py-2 text-center text-[10px] font-semibold text-pink" role="alert">{error}</p>{/if}
          <div class="mt-3">
            <Button variant="glass" size="lg" shine loading={purchasing} on:click={handleBuyClick}>
              <Ticket size={17} /> {$_('raffle.chooseTicketNumbers')}
            </Button>
          </div>

          <div class="terms-consent mt-2.5 flex min-h-11 items-stretch overflow-hidden rounded-[14px] bg-bg-start/65">
            <button type="button" role="checkbox" aria-checked={agreedToTerms} on:click={() => (agreedToTerms = !agreedToTerms)} on:animationend={() => (termsShake = false)} class="tappable flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3 text-left">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border {agreedToTerms ? 'border-primary-dark/45 bg-action-bg' : termsShake ? 'border-pink bg-pink-bg' : 'border-dot-inactive bg-card'} {termsShake ? 'terms-shake' : ''}" aria-hidden="true">{#if agreedToTerms}<Check size={12} class="text-primary-dark" strokeWidth={3.5} />{/if}</span>
              <span class="truncate text-[10px] font-semibold text-[#586660]">{$_('raffle.agreeConditions')}</span>
            </button>
            <button type="button" class="tappable min-h-11 shrink-0 border-l border-primary-dark/10 px-3 text-[10px] font-extrabold text-primary-dark underline underline-offset-2" on:click={() => (termsOpen = true)}>{$_('raffle.readTerms')}</button>
          </div>
          <p class="purchase-note mt-2 flex items-center justify-center gap-1.5 text-center text-[9px] text-muted">{#if !$auth.isAuthenticated}<Phone size={10} /> {$_('raffle.signInBeforePayment')}{:else}<ShieldCheck size={10} /> {$_('raffle.securedAtCheckout')}{/if}</p>
        </div>
      {:else if raffle.status === 'open' && ticketsRemaining > 0}
        <div class="flex items-center gap-3 px-4 py-4 text-xs text-muted">
          <Info size={17} class="shrink-0 text-primary-dark" />
          <span>{raffle.isDemo ? $_('raffle.demoNotice') : $_('raffle.pausedNotice')}</span>
        </div>
      {:else}
        <div class="flex items-center gap-3 px-4 py-4 text-xs text-muted"><CalendarClock size={17} class="shrink-0 text-primary-dark" /><span>{$_('raffle.closedNotice', { values: { status: $_(`raffle.status.${raffle.status}`) } })}</span></div>
      {/if}
    </section>
  </article>
{/if}

{#if termsOpen}
  <button type="button" class="fixed inset-0 z-40 cursor-default bg-[#152521]/45" aria-label={$_('raffle.closeAria')} on:click={() => (termsOpen = false)} transition:fade={{ duration: 160 }}></button>
  <section class="no-scrollbar fixed inset-x-5 top-1/2 z-50 max-h-[70dvh] -translate-y-1/2 overflow-y-auto overscroll-y-contain rounded-card bg-card p-5 shadow-card" transition:scale={{ duration: 180, start: 0.95, opacity: 0, easing: cubicOut }}>
    <div class="mb-3 flex items-center justify-between"><h2 class="text-[15px] font-extrabold text-ink">{$_('raffle.termsTitle')}</h2><button type="button" aria-label={$_('raffle.closeAria')} class="tappable pressable flex h-11 w-11 items-center justify-center rounded-full bg-bg-start text-primary-dark" on:click={() => (termsOpen = false)}><X size={16} /></button></div>
    <ul class="flex flex-col gap-2.5 text-[12px] leading-snug text-muted"><li>{$_('raffle.termsList.age')}</li><li>{$_('raffle.termsList.final')}</li><li>{$_('raffle.termsList.independent')}</li><li>{$_('raffle.termsList.max')}</li><li>{$_('raffle.termsList.fairness')}</li></ul>
    <div class="mt-4"><Button size="md" on:click={() => (termsOpen = false)}>{$_('raffle.understood')}</Button></div>
  </section>
{/if}

{#if lightboxIndex !== null}
  {@const activePrize = rankedPrizes[lightboxIndex]}
  <div class="lightbox fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={activePrize ? $_('raffle.placeLabel', { values: { ordinal: ordinal(activePrize.tier) } }) + ' ' + $_('raffle.prizePhoto') : ''}>
    <button type="button" aria-label={$_('raffle.closeAria')} class="absolute inset-0 bg-[#0b1613]/92 backdrop-blur-sm" on:click={closeLightbox} transition:fade={{ duration: 200 }}></button>

    <div class="lightbox-content absolute inset-0 flex flex-col" transition:scale={lightboxContentParams()}>
      <div
        bind:this={lightboxEl}
        on:scroll={handleLightboxScroll}
        use:scrollToIndexInstant={lightboxIndex}
        data-swipe-region
        role="presentation"
        class="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-x]"
      >
        {#each rankedPrizes as prize, i (prize.id)}
          <div class="flex h-full w-full shrink-0 snap-start items-center justify-center px-5">
            {#if prize.imageUrl}
              <img src={resolveImageUrl(prize.imageUrl)} alt={prize.name} class="max-h-full max-w-full rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]" />
            {/if}
          </div>
        {/each}
      </div>

      <button
        type="button"
        aria-label={$_('raffle.closeAria')}
        class="tappable pressable absolute right-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#172c27]/60 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md"
        style="top: max(16px, var(--safe-top));"
        on:click={closeLightbox}
      ><X size={19} /></button>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-16 text-center bg-gradient-to-t from-[#0b1613]/85 to-transparent">
        {#if activePrize}
          <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{$_('raffle.placeLabel', { values: { ordinal: ordinal(activePrize.tier) } })}</p>
          <p class="mt-1 text-[15px] font-extrabold text-white">{activePrize.name}</p>
        {/if}
        {#if rankedPrizes.length > 1}
          <div class="mt-3 flex items-center justify-center gap-1.5">
            {#each rankedPrizes as prize, i (prize.id)}
              <span class="h-1.5 rounded-full transition-[width,background-color] duration-200 {i === lightboxIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/35'}"></span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(html.raffle-detail-lock),
  :global(html.raffle-detail-lock body) { height: 100%; overflow: hidden; overscroll-behavior: none; }
  .raffle-screen { display: flex; height: calc(100dvh - max(44px, var(--safe-top)) - 120px - var(--safe-bottom)); min-height: 0; flex-direction: column; gap: 10px; overflow: hidden; touch-action: pan-x; overscroll-behavior-y: none; }
  .raffle-cover { width: 100%; aspect-ratio: var(--raffle-artwork-ratio); flex: 0 0 auto; }
  .prize-glass-flash {
    z-index: 1;
    transform: translate3d(-150%, 0, 0) skewX(-18deg);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18) 28%, rgba(255, 255, 255, 0.72) 50%, rgba(255, 255, 255, 0.16) 72%, transparent);
    filter: blur(1px);
    animation: prize-glass-flash 5.2s cubic-bezier(0.16, 1, 0.3, 1) 700ms infinite;
    will-change: transform;
  }
  .prize-glass-flash.is-paused { animation-play-state: paused; }
  .prize-carousel { flex: 0 0 64px; min-height: 64px; overflow: hidden; }
  .ticket-sheet { flex: 0 0 auto; }
  .terms-shake { animation: terms-shake 380ms var(--ease-out); }
  @keyframes prize-glass-flash {
    0%, 72% { transform: translate3d(-150%, 0, 0) skewX(-18deg); }
    88%, 100% { transform: translate3d(380%, 0, 0) skewX(-18deg); }
  }
  @keyframes terms-shake { 20%, 60% { transform: translateX(-3px); } 40%, 80% { transform: translateX(3px); } }
  @media (max-height: 720px) { .raffle-screen { gap: 7px; } .raffle-description, .purchase-note { display: none; } .raffle-actions { padding-top: 8px; padding-bottom: 8px; } }
  @media (max-height: 630px) { .raffle-screen header p { display: none; } .prize-carousel { display: none; } }
  @media (prefers-reduced-motion: reduce) { .terms-shake, .prize-glass-flash { animation: none; } }
</style>
