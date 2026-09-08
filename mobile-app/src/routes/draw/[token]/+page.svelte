<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import { api, ApiError } from '$lib/api/client.js';
  import { CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Users } from 'lucide-svelte';
  import { hapticMedium } from '$lib/native/haptics.js';

  type DrawContext = {
    raffleName: string;
    raffleCode: string;
    tier: number;
    prizeName: string;
    registeredUsers: number;
    drawDateTime: string | null;
    status: string;
    canSpin: boolean;
  };

  type DrawResult = {
    raffleName: string;
    tier: number;
    prizeName: string;
    winnerTicketCode: string;
    totalTickets: number;
    serverSeed: string | null;
    serverSeedHash: string;
    clientSeed: string;
    combinedHash: string;
  };

  let draw: DrawContext | null = null;
  let result: DrawResult | null = null;
  let spinning = true;
  let displayTicket = '-----';
  let pass = 1;
  let error = '';

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function ordinal(n: number): string {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
  }

  function randomTicket(): string {
    const value = Math.floor(Math.random() * 100000);
    return `${draw?.raffleCode ?? 'DRAW'}-${String(value).padStart(5, '0')}`;
  }

  async function shuffleThreePasses(): Promise<void> {
    if (reduceMotion) return;
    for (let currentPass = 1; currentPass <= 3; currentPass += 1) {
      pass = currentPass;
      const frames = currentPass === 3 ? 13 : 10;
      for (let frame = 0; frame < frames; frame += 1) {
        displayTicket = randomTicket();
        await sleep(currentPass === 3 ? 65 + frame * 8 : 48);
      }
    }
  }

  async function run(): Promise<void> {
    try {
      const response = await api.get<{ draw: DrawContext }>(`/draws/${$page.params.token}`, { skipAuth: true });
      draw = response.draw;
      if (!draw.canSpin) {
        error = draw.status === 'clicked'
          ? 'This draw has already been completed.'
          : 'This one-time draw invitation is no longer available.';
        return;
      }

      await hapticMedium();
      const [spinResponse] = await Promise.all([
        api.post<DrawResult>(`/draws/${$page.params.token}/spin`, undefined, { skipAuth: true }),
        shuffleThreePasses(),
      ]);
      displayTicket = spinResponse.winnerTicketCode;
      result = spinResponse;
      await hapticMedium();
    } catch (cause) {
      error = cause instanceof ApiError && cause.status === 404
        ? 'This draw invitation is invalid.'
        : cause instanceof ApiError && [409, 410].includes(cause.status)
          ? 'This one-time draw invitation has already been used, replaced, or expired.'
          : 'The draw could not be completed. Please check your connection.';
    } finally {
      spinning = false;
    }
  }

  const drawTime = (value: string | null | undefined) => value
    ? new Intl.DateTimeFormat('en-ET', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Addis_Ababa',
      }).format(new Date(value))
    : 'Preparing draw time';

  onMount(run);
</script>

<svelte:head><title>Fair draw · YeneEta</title></svelte:head>

<main class="draw-page min-h-[100dvh] overflow-hidden bg-[#e9faf5] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#142a25]">
  <div class="mx-auto flex min-h-[calc(100dvh-48px)] max-w-md flex-col">
    <header class="flex items-start justify-between pt-2">
      <div class="min-w-0 pr-4">
        <p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0c9f7d]">YeneEta verified draw</p>
        <h1 class="mt-1 truncate text-xl font-black tracking-[-0.03em]">{draw?.raffleName ?? 'Loading raffle'}</h1>
      </div>
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0c9f7d] shadow-sm"><ShieldCheck size={21} /></span>
    </header>

    {#if error}
      <section class="my-auto text-center" in:fade={{ duration: 160 }}>
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#d85353] shadow-sm"><LockKeyhole size={27} /></span>
        <h2 class="mt-5 text-xl font-black">Draw unavailable</h2>
        <p class="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#60746f]">{error}</p>
      </section>
    {:else}
      <section class="mt-8 border-y border-[#bddfd5] py-4">
        <p class="text-center text-sm font-black text-[#0c9f7d]">{draw ? `${ordinal(draw.tier)} Prize · ${draw.prizeName}` : 'Preparing prize'}</p>
        <div class="mt-3 flex items-center justify-center gap-5 text-[11px] font-bold text-[#60746f]">
          <span class="flex items-center gap-1.5"><Clock3 size={14} /> {drawTime(draw?.drawDateTime)}</span>
          <span class="flex items-center gap-1.5"><Users size={14} /> {draw?.registeredUsers ?? 0} participants</span>
        </div>
      </section>

      <div class="my-auto flex flex-col items-center py-8">
        <div class:reel-active={spinning} class:reel-done={!!result} class="reel relative flex h-64 w-64 flex-col items-center justify-center rounded-full border-[10px] border-white bg-white text-center shadow-[0_18px_50px_rgba(21,78,65,0.18)]">
          {#if result}
            <div class="px-5" in:fade={{ duration: 220 }}>
              <CheckCircle2 size={28} class="mx-auto text-[#0c9f7d]" />
              <p class="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#60746f]">Winning ticket</p>
              <p class="mt-1 text-2xl font-black tracking-[-0.03em] tabular-nums">{result.winnerTicketCode}</p>
              <p class="mt-3 text-xs font-bold text-[#0c9f7d]">Result securely recorded</p>
            </div>
          {:else}
            <div class="px-4">
              <p class="text-xl font-black tracking-[-0.025em] tabular-nums">{displayTicket}</p>
              <p class="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0c9f7d]">Shuffle {pass} of 3</p>
            </div>
          {/if}
        </div>
        <p class="mt-6 max-w-[290px] text-center text-xs leading-5 text-[#60746f]">Each paid ticket is one independent chance. No participant details are displayed during the draw.</p>
      </div>
    {/if}
  </div>
</main>

<style>
  .reel { transition: box-shadow 260ms ease, transform 260ms ease; }
  .reel-active { animation: reel-pulse 700ms ease-in-out infinite; box-shadow: 0 0 0 6px rgba(12,159,125,.14), 0 18px 50px rgba(21,78,65,.18); }
  .reel-done { box-shadow: 0 0 0 6px rgba(12,159,125,.22), 0 18px 50px rgba(21,78,65,.18); }
  @keyframes reel-pulse { 50% { transform: scale(1.018); } }
  @media (prefers-reduced-motion: reduce) { .reel-active { animation: none; } }
</style>
