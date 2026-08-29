<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import IosSpinner from './IosSpinner.svelte';
  import { Sparkles, ArrowRight, Dices, Trophy, ShieldCheck } from 'lucide-svelte';

  export let autoRedirect: boolean = true;
  export let redirectDelayMs: number = 4000;

  const slides = [
    {
      image: '/images/splash-screen-1.jpg',
      title: 'Win Big Daily',
      subtitle: 'Transparent, provably-fair raffles with incredible prizes in Ethiopia',
      tag: 'Ethiopia #1 Raffle Platform',
      color: '#7C3AED',
    },
    {
      image: '/images/splash-screen-2.jpg',
      title: 'Your Turn to Win',
      subtitle: 'Buy tickets easily with Telebirr & Chapa. Track your odds in real time',
      tag: 'Instant Digital Payouts',
      color: '#F59E0B',
    },
  ];

  let currentSlide = 0;
  let progress = 0;
  let intervalId: any;
  let progressIntervalId: any;
  let isNavigating = false;

  function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    progress = 0;
  }

  function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    progress = 0;
  }

  function handleStart() {
    if (isNavigating) return;
    isNavigating = true;
    clearInterval(intervalId);
    clearInterval(progressIntervalId);
    goto('/home', { replaceState: true });
  }

  onMount(() => {
    // Progress bar tick every 50ms
    const step = 50 / (redirectDelayMs / 2);
    progressIntervalId = setInterval(() => {
      progress = Math.min(100, progress + step * 100);
    }, 50);

    // Auto-swap slides every half of total delay
    intervalId = setInterval(() => {
      currentSlide = (currentSlide + 1) % slides.length;
      progress = 0;
    }, redirectDelayMs / 2);

    // Optional auto-redirect
    let timeoutId: any;
    if (autoRedirect) {
      timeoutId = setTimeout(() => {
        handleStart();
      }, redirectDelayMs);
    }

    return () => {
      clearInterval(intervalId);
      clearInterval(progressIntervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  });
</script>

<div class="relative flex h-screen w-full flex-col justify-between overflow-hidden bg-black text-white select-none">
  <!-- Background Images with Crossfade -->
  {#each slides as slide, index}
    <div
      class="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
      style="
        background-image: url('{slide.image}');
        opacity: {currentSlide === index ? 1 : 0};
        transform: scale({currentSlide === index ? 1.03 : 1});
        transition: opacity 1s ease-in-out, transform 4s ease-out;
      "
    >
      <!-- Gradient overlays for readability -->
      <div class="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/95"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
    </div>
  {/each}

  <!-- Top Bar: Brand + Slide Indicators + iOS Spinner -->
  <header class="relative z-20 flex items-center justify-between px-6 pt-12">
    <div class="flex items-center gap-2.5 rounded-full bg-black/40 px-3.5 py-1.5 backdrop-blur-md border border-white/10">
      <div class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-black">
        <Dices size={14} class="stroke-[2.5]" />
      </div>
      <span class="font-bold tracking-wider text-xs uppercase text-white">TOMBOLA</span>
    </div>

    <!-- Small iPhone Spinning Icon Loader -->
    <div class="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md border border-white/10">
      <IosSpinner size={16} color="#00D3A0" />
      <span class="text-[11px] font-medium text-white/80">Loading</span>
    </div>
  </header>

  <!-- Middle Floating Badge -->
  <div class="relative z-20 flex flex-col items-center px-6 text-center">
    <div
      class="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold backdrop-blur-md border transition-all duration-500"
      style="
        background: {slides[currentSlide].color}22;
        border-color: {slides[currentSlide].color}66;
        color: #ffffff;
      "
    >
      <Sparkles size={12} class="animate-pulse" />
      <span>{slides[currentSlide].tag}</span>
    </div>
  </div>

  <!-- Bottom Content Card -->
  <div class="relative z-20 flex flex-col gap-6 px-6 pb-10">
    <!-- Slide Text -->
    <div class="flex flex-col gap-2">
      <h1 class="text-3xl font-extrabold tracking-tight text-white sm:text-4xl drop-shadow-md">
        {slides[currentSlide].title}
      </h1>
      <p class="text-sm leading-relaxed text-white/80 drop-shadow">
        {slides[currentSlide].subtitle}
      </p>
    </div>

    <!-- Slide Indicators / Progress Bars -->
    <div class="flex gap-2">
      {#each slides as _, i}
        <button
          type="button"
          on:click={() => { currentSlide = i; progress = 0; }}
          class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20 transition-all"
          aria-label="Slide {i + 1}"
        >
          <div
            class="h-full rounded-full bg-primary transition-all duration-100"
            style="width: {currentSlide === i ? (progress + '%') : (currentSlide > i ? '100%' : '0%')}"
          ></div>
        </button>
      {/each}
    </div>

    <!-- Action Buttons with iPhone Activity Indicator -->
    <div class="flex flex-col gap-3 pt-2">
      <button
        type="button"
        on:click={handleStart}
        class="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-base text-black shadow-lg shadow-primary/30 transition-transform active:scale-[0.98]"
      >
        {#if isNavigating}
          <IosSpinner size={18} color="#000000" />
          <span>Opening App…</span>
        {:else}
          <span>Explore Raffles</span>
          <ArrowRight size={18} />
        {/if}
      </button>

      <!-- Sub-features badges -->
      <div class="flex items-center justify-center gap-4 text-[11px] text-white/60 pt-1">
        <span class="flex items-center gap-1">
          <ShieldCheck size={13} class="text-primary" /> Provably Fair
        </span>
        <span>•</span>
        <span class="flex items-center gap-1">
          <Trophy size={13} class="text-yellow-400" /> Real Cash & Prizes
        </span>
      </div>
    </div>
  </div>
</div>
