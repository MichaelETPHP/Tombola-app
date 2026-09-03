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

<div class="flex flex-col gap-7">
  <Header />

  <section class="flex flex-col gap-2">
    <span class="text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary-dark">Live prizes</span>
    <h1 class="max-w-[360px] font-sans text-[28px] font-extrabold leading-[1.08] tracking-[-0.04em] text-ink">
      Pick a prize. Choose your tickets. You’re in.
    </h1>
    <p class="max-w-[390px] text-[13px] leading-relaxed text-muted">
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
        class="tappable pressable inline-flex h-10 items-center gap-2 rounded-button bg-primary px-4 text-xs font-bold text-[#10211d]"
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

  <section class="flex flex-col gap-2">
    <div>
      <p class="text-[15px] font-extrabold text-ink">Real people, real prizes</p>
      <p class="mt-0.5 text-[11px] text-muted">Live activity across YeneEta</p>
    </div>
    <WinnersMarquee />
  </section>

  <section class="deferred-section flex flex-col gap-3">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h2 class="text-base font-extrabold text-ink">More open raffles</h2>
        <p class="mt-0.5 text-[11px] text-muted">Every ticket gives you one chance</p>
      </div>
      <a href="/raffles" class="tappable flex shrink-0 items-center gap-1 text-xs font-bold text-primary-dark">
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
</div>

<style>
  .deferred-section {
    content-visibility: auto;
    contain-intrinsic-size: auto 520px;
  }
</style>
