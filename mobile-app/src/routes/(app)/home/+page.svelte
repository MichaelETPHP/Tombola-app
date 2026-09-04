<script lang="ts">
  import { onMount } from 'svelte';
  import { raffles, isLoadingRaffles, type Raffle } from '$lib/stores/raffles.store.js';
  import { api } from '$lib/api/client.js';
  import Header from '$lib/components/Header.svelte';
  import BannerCarousel from '$lib/components/BannerCarousel.svelte';
  import BannerSkeleton from '$lib/components/BannerSkeleton.svelte';
  import RaffleCard from '$lib/components/RaffleCard.svelte';
  import RaffleCardSkeleton from '$lib/components/RaffleCardSkeleton.svelte';
  import WinnersMarquee from '$lib/components/WinnersMarquee.svelte';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { ArrowRight } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();
  let loadError = false;

  async function loadRaffles() {
    isLoadingRaffles.set(true);
    loadError = false;
    try {
      const res = await api.get<{ raffles: Raffle[] }>('/raffles?status=open&limit=10', {
        skipAuth: true,
      });
      raffles.set(res.raffles);
    } catch (err) {
      loadError = true;
      console.error('Failed to load raffles', err);
    } finally {
      isLoadingRaffles.set(false);
    }
  }

  onMount(() => {
    loadRaffles();
    pullRefresh.set(loadRaffles);
  });
</script>

<div class="home-page flex flex-col gap-6">
  <Header />

  <section class="flex flex-col gap-2.5 pt-1">
    <span class="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-dark px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white shadow-[0_7px_16px_-12px_rgba(0,105,80,0.8)]">
      <span class="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true"></span>
      Live prizes
    </span>
    <h1 class="max-w-[370px] font-sans text-[29px] font-extrabold leading-[1.07] tracking-[-0.035em] text-ink">
      Pick a prize. Choose your tickets. You’re in.
    </h1>
    <p class="max-w-[390px] text-[12px] font-medium leading-[1.65] text-[#586660]">
      Enter with as little as one ticket. You can hold up to five tickets in each raffle.
    </p>
  </section>

  {#if $isLoadingRaffles}
    <BannerSkeleton />
  {:else if loadError}
    <section class="flex flex-col items-start gap-3 rounded-card border border-white/70 bg-card p-5 shadow-card-light">
      <p class="text-sm font-bold text-ink">Couldn’t load the live prizes</p>
      <p class="text-xs leading-relaxed text-muted">Check your connection, then try again.</p>
      <button
        type="button"
        class="tappable pressable inline-flex h-11 items-center gap-2 rounded-button bg-primary px-4 text-xs font-bold text-[#10211d]"
        on:click={loadRaffles}
      >
        Try again <ArrowRight size={15} />
      </button>
    </section>
  {:else if $raffles.length > 0}
    <BannerCarousel raffles={$raffles.slice(0, 5)} />
  {:else}
    <section class="rounded-card border border-white/70 bg-card p-5 shadow-card-light">
      <p class="text-sm font-bold text-ink">New prizes are coming</p>
      <p class="mt-1 text-xs leading-relaxed text-muted">There are no open raffles right now. Check again soon.</p>
    </section>
  {/if}

  <section class="deferred-section flex flex-col gap-3">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h2 class="text-[17px] font-extrabold tracking-[-0.02em] text-ink">More ways to win</h2>
        <p class="mt-1 text-[10px] font-medium text-[#586660]">Every ticket gives you one fair chance</p>
      </div>
      <a href="/raffles" class="tappable flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-extrabold text-primary-dark no-underline">
        View all <ArrowRight size={14} />
      </a>
    </div>

    {#if $isLoadingRaffles}
      <RaffleCardSkeleton />
      <RaffleCardSkeleton />
    {:else if $raffles.length > 1}
      {#each $raffles.slice(1, 4) as raffle, i (raffle.id)}
        <RaffleCard {raffle} index={i} />
      {/each}
    {:else if $raffles.length === 1}
      <p class="rounded-button bg-card/70 px-4 py-3 text-xs text-muted">The featured raffle is the only prize open right now.</p>
    {/if}
  </section>

  <section class="flex flex-col gap-3">
    <div>
      <h2 class="text-[17px] font-extrabold tracking-[-0.02em] text-ink">Real people, real prizes</h2>
      <p class="mt-1 text-[10px] font-medium text-[#586660]">Live activity across YeneEta</p>
    </div>
    <WinnersMarquee />
  </section>
</div>

<style>
  .home-page {
    animation: home-arrive 420ms var(--ease-out) both;
  }

  @keyframes home-arrive {
    from {
      opacity: 0.65;
      transform: translateY(8px);
      filter: blur(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .deferred-section {
    content-visibility: auto;
    contain-intrinsic-size: auto 520px;
  }

  @media (prefers-reduced-motion: reduce) {
    .home-page {
      animation: none;
    }
  }
</style>
