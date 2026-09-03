<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import { api, ApiError } from '$lib/api/client.js';
  import { CheckCircle2, LockKeyhole, RotateCw, ShieldCheck } from 'lucide-svelte';
  import { hapticMedium } from '$lib/native/haptics.js';

  type DrawContext = {
    raffleName: string;
    raffleCode: string;
    tier: number;
    prizeName: string;
    registeredUsers: number;
    participantPhones: string[];
    status: string;
    expiresAt: string;
    canSpin: boolean;
  };

  // 1st, 2nd, 3rd, 4th, 11th, 21st, ...
  function ordinal(n: number): string {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }
  type DrawResult = {
    raffleName: string;
    winnerTicketCode: string;
    winnerPhone: string;
    totalTickets: number;
    serverSeed: string | null;
    serverSeedHash: string;
    clientSeed: string;
    combinedHash: string;
  };

  let draw: DrawContext | null = null;
  let result: DrawResult | null = null;
  let spinning = false;
  let reelRunning = false;
  let displayPhone = '';
  let error = '';

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function randomPhone(): string {
    const pool = draw?.participantPhones ?? [];
    if (pool.length === 0) return '';
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Cycles the reel through masked participant numbers at a fast, steady
  // clip. Starts the instant the page mounts (before the network even
  // responds) so the reel itself IS the loading state — there's no
  // separate splash screen to sit through first.
  async function fastReel() {
    reelRunning = true;
    while (reelRunning) {
      displayPhone = randomPhone();
      await sleep(55);
    }
  }

  // Slot-machine deceleration: each step waits a little longer than the
  // last, landing exactly on the real winner's number.
  async function decelerateTo(finalPhone: string) {
    const delays = [70, 90, 120, 160, 210, 270, 350, 450];
    for (const delay of delays) {
      displayPhone = randomPhone();
      await sleep(delay);
    }
    displayPhone = finalPhone;
  }

  // Opening the link IS the intent to draw — there's no separate "Spin"
  // tap. Loads the context and, the moment it's spinnable, fires the
  // real draw immediately, back-to-back, under one continuous reel
  // animation instead of a load-then-wait-for-a-tap flow.
  async function run() {
    error = '';
    result = null;
    spinning = true;
    void fastReel();
    try {
      const response = await api.get<{ draw: DrawContext }>(`/draws/${$page.params.token}`, { skipAuth: true });
      draw = response.draw;
      if (!draw.canSpin) {
        reelRunning = false;
        error =
          draw.status === 'clicked'
            ? 'This link has already been used.'
            : 'This one-time link has already been used, replaced, or expired.';
        return;
      }
      await hapticMedium();
      const spinResponse = await api.post<DrawResult>(`/draws/${$page.params.token}/spin`, undefined, { skipAuth: true });
      reelRunning = false;
      await decelerateTo(spinResponse.winnerPhone);
      result = spinResponse;
      await hapticMedium();
    } catch (cause) {
      reelRunning = false;
      error =
        cause instanceof ApiError && cause.status === 404
          ? 'This draw link is invalid.'
          : cause instanceof ApiError && [409, 410].includes(cause.status)
            ? 'This one-time link has already been used, replaced, or expired.'
            : 'The draw could not be completed. Check your connection and try again.';
    } finally {
      spinning = false;
    }
  }

  onMount(run);
</script>

<svelte:head>
  <title>Fair draw · YeneEta</title>
  <link rel="preload" as="video" href="/videos/confetti.webm" type="video/webm" />
</svelte:head>

<main class="draw-screen relative min-h-[100dvh] overflow-hidden bg-[#e9faf5] px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#142a25]">
  {#if result && !reduceMotion}
    <video
      class="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      src="/videos/confetti.webm"
      autoplay
      muted
      playsinline
    ></video>
  {/if}

  <div class="relative z-10 mx-auto flex min-h-[calc(100dvh-52px)] max-w-md flex-col">
    <header class="flex items-center justify-between py-2">
      <div>
        <p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0c9f7d]">YeneEta fair draw</p>
        <h1 class="mt-1 max-w-[220px] truncate text-xl font-extrabold tracking-[-0.03em]">{draw?.raffleName ?? ' '}</h1>
      </div>
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0c9f7d]"><ShieldCheck size={21} /></span>
    </header>

    {#if error && !draw}
      <section class="my-auto rounded-[28px] bg-white p-7 text-center"><LockKeyhole size={30} class="mx-auto text-[#ff6d6d]" /><h2 class="mt-4 text-lg font-extrabold">Link unavailable</h2><p class="mt-2 text-sm leading-6 text-[#60746f]">{error}</p><button on:click={run} class="mt-5 h-11 rounded-2xl bg-[#142a25] px-6 text-sm font-bold text-white">Try again</button></section>
    {:else}
      <p class="mt-1 text-center text-sm font-bold text-[#0c9f7d]">{draw ? `${ordinal(draw.tier)} Prize · ${draw.prizeName}` : " "}</p>
      <p class="mt-1 text-center text-xs font-bold uppercase tracking-[0.14em] text-[#60746f]">{draw ? `${draw.registeredUsers} registered user${draw.registeredUsers === 1 ? '' : 's'}` : ' '}</p>

      <div class="relative my-auto flex flex-col items-center py-6">
        <div
          class:reel-active={spinning}
          class:reel-done={!!result}
          class="reel relative flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-full border-[10px] border-white bg-white text-center shadow-[0_18px_50px_rgba(21,78,65,0.18)]"
        >
          {#if result}
            <div in:fade={{ duration: 220 }} class="flex flex-col items-center gap-2 px-4">
              <CheckCircle2 size={26} class="text-[#0c9f7d]" />
              <p class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#60746f]">Winner</p>
              <p class="text-2xl font-black tracking-[-0.02em] tabular-nums text-[#142a25]">{result.winnerPhone}</p>
              <p class="text-[11px] font-semibold text-[#60746f]">{result.winnerTicketCode}</p>
            </div>
          {:else if error}
            <div in:fade={{ duration: 150 }} class="flex flex-col items-center gap-2 px-5">
              <LockKeyhole size={24} class="text-[#ff6d6d]" />
              <p class="text-xs leading-5 text-[#60746f]">{error}</p>
            </div>
          {:else}
            <div class="px-4">
              {#key displayPhone}
                <p in:fade={{ duration: 70 }} class="text-xl font-black tracking-[-0.02em] tabular-nums text-[#142a25]">{displayPhone || '+251 •••••••••'}</p>
              {/key}
              <p class="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0c9f7d]">Selecting…</p>
            </div>
          {/if}
        </div>
      </div>

      {#if error && draw}
        <button on:click={run} class="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-[#142a25] text-sm font-extrabold text-white active:scale-[0.98]"><RotateCw size={18} /> Try again</button>
      {/if}
    {/if}
  </div>
</main>

<style>
  .reel { transition: box-shadow 0.3s ease; }
  .reel-active { box-shadow: 0 0 0 6px rgba(12, 159, 125, 0.14), 0 18px 50px rgba(21, 78, 65, 0.18); animation: reel-pulse 0.9s ease-in-out infinite; }
  .reel-done { box-shadow: 0 0 0 6px rgba(12, 159, 125, 0.22), 0 18px 50px rgba(21, 78, 65, 0.18); }
  @keyframes reel-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.015); }
  }
  @media (prefers-reduced-motion: reduce) {
    .reel-active { animation: none; }
  }
</style>
