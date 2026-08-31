<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { CheckCircle2, LockKeyhole, RotateCw, ShieldCheck, Ticket, Trophy } from 'lucide-svelte';
  import { hapticMedium } from '$lib/native/haptics.js';

  type DrawContext = {
    raffleName: string;
    raffleCode: string;
    prizeName: string;
    prizeImageUrl: string | null;
    ticketCount: number;
    drawCommitment: string;
    status: string;
    expiresAt: string;
    canSpin: boolean;
  };
  type DrawResult = {
    raffleName: string;
    winnerTicketCode: string;
    totalTickets: number;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    combinedHash: string;
  };

  let draw: DrawContext | null = null;
  let result: DrawResult | null = null;
  let loading = true;
  let spinning = false;
  let error = '';

  async function load() {
    try {
      const response = await api.get<{ draw: DrawContext }>(`/draws/${$page.params.token}`, { skipAuth: true });
      draw = response.draw;
    } catch (cause) {
      error = cause instanceof ApiError && cause.status === 404
        ? 'This draw link is invalid.'
        : 'The draw could not be loaded. Check your connection and try again.';
    } finally {
      loading = false;
    }
  }

  async function spin() {
    if (!draw?.canSpin || spinning) return;
    spinning = true;
    error = '';
    await hapticMedium();
    try {
      const response = await api.post<DrawResult>(`/draws/${$page.params.token}/spin`, undefined, { skipAuth: true });
      await new Promise((resolve) => setTimeout(resolve, 2400));
      result = response;
      draw.canSpin = false;
      await hapticMedium();
    } catch (cause) {
      error = cause instanceof ApiError && [409, 410].includes(cause.status)
        ? 'This one-time link has already been used, replaced, or expired.'
        : 'The draw could not be completed. Please try again.';
      spinning = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>Fair draw · Tombola</title></svelte:head>

<main class="draw-screen min-h-[100dvh] bg-[#e9faf5] px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#142a25]">
  <div class="mx-auto flex min-h-[calc(100dvh-52px)] max-w-md flex-col">
    <header class="flex items-center justify-between py-2">
      <div><p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0c9f7d]">Tombola fair draw</p><h1 class="mt-1 text-xl font-extrabold tracking-[-0.03em]">Community spin</h1></div>
      <span class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0c9f7d]"><ShieldCheck size={21} /></span>
    </header>

    {#if loading}
      <div class="my-auto space-y-4" aria-label="Loading draw"><div class="mx-auto h-56 w-56 animate-pulse rounded-full bg-white/80"></div><div class="mx-auto h-12 w-52 animate-pulse rounded-2xl bg-white/80"></div></div>
    {:else if error && !draw}
      <section class="my-auto rounded-[28px] bg-white p-7 text-center"><LockKeyhole size={30} class="mx-auto text-[#ff6d6d]" /><h2 class="mt-4 text-lg font-extrabold">Link unavailable</h2><p class="mt-2 text-sm leading-6 text-[#60746f]">{error}</p><button on:click={load} class="mt-5 h-11 rounded-2xl bg-[#142a25] px-6 text-sm font-bold text-white">Try again</button></section>
    {:else if draw}
      <section class="mt-5 overflow-hidden rounded-[30px] bg-white p-5 shadow-[0_18px_48px_rgba(28,94,78,0.10)]">
        <div class="flex items-center gap-4">
          <div class="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#eff8f5]">{#if draw.prizeImageUrl}<img src={draw.prizeImageUrl} alt={draw.prizeName} class="h-full w-full object-cover" />{:else}<span class="flex h-full items-center justify-center text-[#0c9f7d]"><Trophy size={23} /></span>{/if}</div>
          <div class="min-w-0"><p class="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0c9f7d]">{draw.raffleCode}</p><h2 class="mt-1 truncate text-base font-extrabold">{draw.raffleName}</h2><p class="mt-1 flex items-center gap-1.5 text-xs text-[#60746f]"><Ticket size={13} /> {draw.ticketCount} verified tickets</p></div>
        </div>
      </section>

      <div class="relative my-auto flex flex-col items-center py-8">
        <div class="pointer-events-none absolute top-7 z-10 h-0 w-0 border-x-[14px] border-t-[24px] border-x-transparent border-t-[#ff6d6d]"></div>
        <div class:wheel-spin={spinning} class="wheel relative grid h-64 w-64 place-items-center rounded-full border-[10px] border-white shadow-[0_18px_50px_rgba(21,78,65,0.18)]">
          <div class="grid h-24 w-24 place-items-center rounded-full border-[8px] border-white bg-[#142a25] text-center text-white shadow-lg"><span class="text-[11px] font-extrabold uppercase tracking-[0.12em]">{result ? 'Final' : 'Ready'}</span></div>
        </div>

        {#if result}
          <div class="mt-7 text-center"><CheckCircle2 size={28} class="mx-auto text-[#0c9f7d]" /><p class="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#60746f]">Winning ticket</p><p class="mt-1 text-3xl font-black tracking-[-0.04em] text-[#142a25]">{result.winnerTicketCode}</p><p class="mt-2 text-xs text-[#60746f]">Selected from {result.totalTickets} paid tickets</p></div>
        {:else}
          <p class="mt-7 max-w-xs text-center text-sm leading-6 text-[#60746f]">Your spin starts the public reveal. The server’s committed formula selects the ticket; you cannot influence the winner.</p>
        {/if}
      </div>

      {#if error}<p class="mb-3 rounded-2xl bg-[#fff0f0] px-4 py-3 text-center text-xs font-semibold text-[#c74d4d]" role="alert">{error}</p>{/if}
      {#if !result}
        <button on:click={spin} disabled={!draw.canSpin || spinning} class="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-[#ff6d6d] text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(255,109,109,0.28)] active:scale-[0.98] disabled:opacity-50"><RotateCw size={18} class={spinning ? 'animate-spin' : ''} /> {spinning ? 'Selecting one verified ticket…' : draw.canSpin ? 'Spin to reveal winner' : 'Draw link unavailable'}</button>
      {:else}
        <details class="rounded-2xl bg-white px-4 py-3 text-xs text-[#60746f]"><summary class="cursor-pointer font-bold text-[#142a25]">Fairness proof</summary><dl class="mt-3 space-y-2 break-all"><div><dt class="font-bold">Committed hash</dt><dd>{result.serverSeedHash}</dd></div><div><dt class="font-bold">Final hash</dt><dd>{result.combinedHash}</dd></div><div><dt class="font-bold">Revealed seed</dt><dd>{result.serverSeed}</dd></div></dl></details>
      {/if}
    {/if}
  </div>
</main>

<style>
  .wheel { background: conic-gradient(#0fc49a 0 12.5%,#d9f7ef 12.5% 25%,#ff7777 25% 37.5%,#ffe6a6 37.5% 50%,#0fc49a 50% 62.5%,#d9f7ef 62.5% 75%,#ff7777 75% 87.5%,#ffe6a6 87.5%); }
  .wheel::after { content: ''; position: absolute; inset: 19px; border-radius: 999px; border: 1px solid rgba(255,255,255,.78); }
  .wheel-spin { animation: draw-spin 2.4s cubic-bezier(.12,.72,.15,1) forwards; }
  @keyframes draw-spin { from { transform: rotate(0deg); } to { transform: rotate(1880deg); } }
  @media (prefers-reduced-motion: reduce) { .wheel-spin { animation-duration: .2s; } }
</style>
