<script lang="ts">
  import { onMount } from 'svelte';
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
  import ProgressRing from '$lib/components/ProgressRing.svelte';
  import RaffleDetailSkeleton from '$lib/components/RaffleDetailSkeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { openExternal } from '$lib/native/browser.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { Minus, Plus, Phone, ChevronLeft, Check, X } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();

  function goBack() {
    hapticLight();
    // Prefer real back navigation (preserves scroll position on the list,
    // filter state, etc.) — only fall back to Home if there's no history,
    // e.g. this page was opened directly via a deep link.
    if (window.history.length > 1) {
      history.back();
    } else {
      goto('/home');
    }
  }

  let raffle: Raffle | null = null;
  let loading = true;
  let quantity = 1;
  let purchasing = false;
  let error = '';
  let resumedFromAuth = false;
  let agreedToTerms = false;
  let termsOpen = false;
  let termsShake = false;

  async function fetchRaffle() {
    try {
      const res = await api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, {
        skipAuth: true,
      });
      raffle = res.raffle;
      error = '';
    } catch (err) {
      error = 'Could not load this raffle.';
    }
  }

  onMount(async () => {
    await fetchRaffle();

    // Restore a quantity picked before signing in — the phone/OTP round
    // trip is a full navigation away and back, so nothing else survives it.
    // Only relevant on this first load, not on a later pull-to-refresh.
    const pending = getPendingPurchase();
    if (pending && raffle && pending.raffleId === raffle.id) {
      quantity = Math.min(pending.quantity, raffle.maxTicketsPerUser, 5);
      if ($auth.isAuthenticated) {
        resumedFromAuth = true;
      }
    }
    loading = false;
    pullRefresh.set(fetchRaffle);
  });

  function handleBuyClick() {
    if (!agreedToTerms) {
      // Restart the shake even on repeated failed taps — toggling straight
      // back to true wouldn't retrigger the CSS animation, so drop the
      // class for a frame first.
      termsShake = false;
      requestAnimationFrame(() => {
        termsShake = true;
      });
      hapticLight();
      return;
    }
    purchase();
  }

  async function purchase() {
    if (!raffle || !agreedToTerms) return;
    hapticMedium();

    // Browsing and picking a quantity never required an account — this is
    // the one moment that does. Stash the intent and ask for a phone number,
    // then come straight back here to finish.
    if (!$auth.isAuthenticated) {
      setPendingPurchase({ raffleId: raffle.id, quantity });
      goto(`/login?returnTo=${encodeURIComponent(`/raffles/${raffle.id}`)}`);
      return;
    }

    error = '';
    purchasing = true;
    try {
      // This only opens a Chapa checkout — tickets aren't issued yet. The
      // webhook (server-to-server, see api/payments.service.ts) creates
      // them once Chapa confirms the payment actually went through; the
      // /payments/[id] page polls for that to land.
      const result = await api.post<{ paymentId: string; checkoutUrl?: string }>(
        `/raffles/${raffle.id}/tickets`,
        { quantity, paymentGateway: 'chapa' }
      );
      if (!result.checkoutUrl) {
        throw new Error('No checkout URL returned');
      }
      clearPendingPurchase();
      const { opensSeparately } = await openExternal(result.checkoutUrl);
      if (opensSeparately) {
        // Native only — checkout opened in its own tab, so the main app
        // moves on by itself to show payment status underneath. On web,
        // openExternal already navigated us (mock checkout stays on-screen
        // until the user acts on it; a real Chapa redirect leaves the app
        // entirely) — navigating again here would cut that off early.
        goto(`/payments/${result.paymentId}`);
      }
    } catch (err) {
      error = err instanceof ApiError ? 'Purchase failed. Please try again.' : 'Network error.';
    } finally {
      purchasing = false;
    }
  }

  $: soldPct = raffle ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
  $: daysLeft = raffle
    ? Math.max(0, Math.ceil((new Date(raffle.currentDeadline).getTime() - Date.now()) / 86_400_000))
    : 0;
  // Ring shows time *remaining* (drains toward empty, like a countdown)
  // rather than time elapsed — matches the "Days left" label it sits under.
  $: totalDays = raffle
    ? Math.max(
        1,
        Math.ceil((new Date(raffle.currentDeadline).getTime() - new Date(raffle.createdAt).getTime()) / 86_400_000)
      )
    : 1;
  $: remainingPct = Math.min(100, Math.max(0, (daysLeft / totalDays) * 100));
  $: ticketsRemaining = raffle ? Math.max(0, raffle.ticketCap - raffle.ticketsSold) : 0;
  $: maxAllowed = raffle
    ? Math.max(1, Math.min(5, raffle.maxTicketsPerUser, ticketsRemaining || 1))
    : 5;

  // Same math OddsBadge uses elsewhere (RaffleCard) — inlined here so the
  // odds row can sit compactly with the other stat rows instead of as its
  // own pill, which cost more vertical space than this single-screen
  // layout can spare.
  $: odds = raffle && raffle.ticketsSold + quantity > 0 ? (quantity / (raffle.ticketsSold + quantity)) * 100 : 0;
  $: oddsDisplay = odds === 0 ? '0%' : odds < 0.1 ? '<0.1%' : `${odds.toFixed(1)}%`;
</script>

<div>
  {#if loading}
    <RaffleDetailSkeleton />
  {:else if !raffle}
    <div class="flex flex-col items-start gap-4">
      <button
        type="button"
        aria-label="Back"
        on:click={goBack}
        class="tappable pressable flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
      >
        <ChevronLeft size={22} />
      </button>
      <p class="text-[13px] text-muted">{error || 'Raffle not found.'}</p>
    </div>
  {:else}
    <div class="raffle-detail-page">
    <div class="raffle-detail-hero relative overflow-hidden rounded-card shadow-card">
      <PrizeImage
        src={raffle.prizeImageUrl}
        title={raffle.title}
        prizeName={raffle.prizeName}
        size="lg"
        eager
      />

      <button
        type="button"
        aria-label="Back"
        on:click={goBack}
        class="tappable pressable absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm"
      >
        <ChevronLeft size={18} />
      </button>
    </div>

    <div class="flex flex-col gap-0.5">
      <h1 class="truncate font-sans text-lg font-extrabold leading-tight tracking-[-0.025em] text-ink">{raffle.title}</h1>
      <p class="truncate text-xs text-muted">
        {raffle.prizeName} · worth <span class="font-sans font-bold text-primary-dark">{formatEtb(raffle.prizeValue)} ETB</span>
      </p>
    </div>
    {#if raffle.description}
      <p class="raffle-detail-description line-clamp-3 text-xs leading-snug text-ink">{raffle.description}</p>
    {/if}

    <div class="raffle-detail-card flex flex-col overflow-hidden rounded-card bg-card shadow-card">
          <div class="raffle-detail-stats flex items-center justify-around px-4 pb-3 pt-4">
        <div class="flex flex-col items-center gap-1.5">
          <ProgressRing value={soldPct} size={58} thickness={5} color="#00D3A0" trackColor="#E3F9EF">
            <span class="font-sans text-sm font-extrabold text-ink">{raffle.ticketsSold}</span>
          </ProgressRing>
          <div class="text-center leading-none">
            <p class="text-[11px] font-semibold text-ink">Tickets sold</p>
            <p class="text-[10px] text-muted">of {raffle.ticketCap}</p>
          </div>
        </div>

        <div class="h-11 w-px bg-dot-inactive"></div>

        <div class="flex flex-col items-center gap-1.5">
          <ProgressRing value={remainingPct} size={58} thickness={5} color="#FF6B6B" trackColor="#FFE1E6">
            <span class="font-sans text-sm font-extrabold text-ink">{daysLeft}</span>
          </ProgressRing>
          <div class="text-center leading-none">
            <p class="text-[11px] font-semibold text-ink">Days left</p>
            <p class="text-[10px] text-muted">to enter</p>
          </div>
        </div>
      </div>

      <div class="ticket-perforation"></div>

      <div class="flex flex-col gap-1.5 px-4 py-2.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted">Price per ticket</span>
          <span class="font-sans font-bold text-primary-dark">{formatEtb(raffle.ticketPrice)} ETB</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted">Win odds</span>
          <span class="font-semibold text-blue">{oddsDisplay}</span>
        </div>
      </div>

      {#if raffle.status === 'open'}
        <div class="ticket-perforation"></div>

            <div class="raffle-detail-actions flex flex-col gap-2.5 px-4 py-3">
          <div class="flex items-center justify-between">
            <span class="text-[13px] font-semibold text-muted">
              Tickets <span class="text-[11px] font-medium">(1–{maxAllowed})</span>
              {#if resumedFromAuth}
                <span class="ml-1 text-[11px] text-primary-dark">Ready to confirm</span>
              {/if}
            </span>
            <div class="flex items-center gap-4">
              <button
                type="button"
                aria-label="Remove one ticket"
                disabled={quantity <= 1}
                class="tappable pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-start text-primary-dark disabled:cursor-not-allowed disabled:opacity-35"
                on:click={() => {
                  quantity = Math.max(1, quantity - 1);
                  hapticLight();
                }}
              >
                <Minus size={16} />
              </button>
              <span id="qty" class="min-w-6 text-center font-sans text-lg font-extrabold">{quantity}</span>
              <button
                type="button"
                aria-label="Add one ticket"
                disabled={quantity >= maxAllowed}
                class="tappable pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-start text-primary-dark disabled:cursor-not-allowed disabled:opacity-35"
                on:click={() => {
                  quantity = Math.min(maxAllowed, quantity + 1);
                  hapticLight();
                }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {#if error}
            <p class="text-center text-xs text-coral-start">{error}</p>
          {/if}

          <Button variant="glass" loading={purchasing} on:click={handleBuyClick}>
            Enter with {quantity} ticket{quantity > 1 ? 's' : ''} · {formatEtb(quantity * Number(raffle.ticketPrice))} ETB
          </Button>

          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={agreedToTerms}
              aria-label="Agree to Terms &amp; Conditions"
              on:click={() => (agreedToTerms = !agreedToTerms)}
              on:animationend={() => (termsShake = false)}
              class="tappable pressable flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border backdrop-blur-sm transition-colors duration-150 {agreedToTerms
                ? 'border-primary-dark/60 bg-primary/25'
                : termsShake
                  ? 'border-coral-start/70 bg-coral-start/20'
                  : 'border-white/80 bg-white/30'} {termsShake ? 'terms-shake' : ''} shadow-[0_2px_6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]"
            >
              {#if agreedToTerms}
                <Check size={12} class="text-primary-dark" strokeWidth={3.5} />
              {/if}
            </button>
            <p class="text-[10.5px] leading-snug transition-colors duration-150 {termsShake ? 'font-semibold text-coral-start' : 'text-muted'}">
              I agree to the
              <button
                type="button"
                class="tappable font-semibold text-primary-dark underline underline-offset-2"
                on:click={() => (termsOpen = true)}
              >Terms &amp; Conditions</button>
            </p>
          </div>
          {#if !$auth.isAuthenticated}
            <p class="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
              <Phone size={11} /> Sign in by SMS, then continue to secure payment
            </p>
          {:else}
            <p class="text-center text-[10px] text-muted">Ticket numbers appear after payment is confirmed.</p>
          {/if}
        </div>
      {:else}
        <div class="ticket-perforation"></div>
          <p class="px-4 py-3 text-xs text-muted">This raffle is {raffle.status}. Tickets are no longer available.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#if termsOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 cursor-default bg-black/40"
    aria-label="Close"
    on:click={() => (termsOpen = false)}
    transition:fade={{ duration: 160 }}
  ></button>
  <div class="no-scrollbar fixed inset-x-5 top-1/2 z-50 max-h-[70dvh] -translate-y-1/2 overflow-y-auto overscroll-y-contain rounded-card bg-card p-5 shadow-card" transition:scale={{ duration: 180, start: 0.95, opacity: 0, easing: cubicOut }}>
    <div class="mb-3 flex items-center justify-between">
      <p class="text-[15px] font-extrabold text-ink">Terms &amp; Conditions</p>
      <button
        type="button"
        aria-label="Close"
        class="tappable pressable flex h-8 w-8 items-center justify-center rounded-full bg-bg-start text-primary-dark"
        on:click={() => (termsOpen = false)}
      >
        <X size={16} />
      </button>
    </div>
    <ul class="flex flex-col gap-2.5 text-[12px] leading-snug text-muted">
      <li>You must be 18 or older to purchase tickets.</li>
      <li>Ticket purchases are final once payment is confirmed — no refunds or exchanges.</li>
      <li>Each raffle sets its own maximum tickets per person; numbers are issued only after payment clears.</li>
      <li>Winners are chosen using a provably-fair random draw, published and verifiable after the raffle closes.</li>
      <li>Winners must claim their prize before the claim deadline shown on their win, or it is forfeited.</li>
    </ul>
    <div class="mt-4">
      <Button size="md" on:click={() => (termsOpen = false)}>Got it</Button>
    </div>
  </div>
{/if}

<style>
  /*
   * The app shell reserves the bottom 120px for the floating navigation.
   * Everything else is composed inside the remaining dynamic viewport, so
   * the prize image grows on tall phones and contracts on short phones while
   * the purchase controls stay visible without scrolling.
   */
  .terms-shake {
    animation: terms-shake 400ms ease-in-out;
  }

  @keyframes terms-shake {
    10%,
    90% {
      transform: translateX(-1px);
    }
    20%,
    80% {
      transform: translateX(2px);
    }
    30%,
    50%,
    70% {
      transform: translateX(-4px);
    }
    40%,
    60% {
      transform: translateX(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .terms-shake {
      animation: none;
    }
  }

  .raffle-detail-page {
    display: flex;
    height: calc(100dvh - max(44px, var(--safe-top)) - 120px);
    min-height: 0;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .raffle-detail-hero {
    min-height: 104px;
    flex: 1 1 0;
  }

  @media (max-height: 760px) {
    .raffle-detail-page {
      gap: 8px;
    }

    .raffle-detail-hero {
      min-height: 88px;
    }

    .raffle-detail-description {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .raffle-detail-stats {
      padding-top: 10px;
      padding-bottom: 8px;
    }

    .raffle-detail-actions {
      gap: 6px;
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }

  @media (max-height: 640px) {
    .raffle-detail-description {
      display: none;
    }
  }
</style>
