<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { api, ApiError } from '$lib/api/client.js';
  import { CheckCircle2, Clock3, LockKeyhole, ShieldCheck } from 'lucide-svelte';
  import { hapticMedium } from '$lib/native/haptics.js';

  type RepresentativeContext = {
    raffleName: string;
    tier: number;
    prizeName: string;
    status: 'assigned' | 'approved' | 'expired';
    expiresAt: string | null;
    approvedAt: string | null;
    canApprove: boolean;
  };

  let context: RepresentativeContext | null = null;
  let loading = true;
  let approving = false;
  let approved = false;
  let error = '';

  async function load(): Promise<void> {
    loading = true;
    error = '';
    try {
      const response = await api.get<{ representative: RepresentativeContext }>(
        `/draws/represent/${$page.params.token}`,
        { skipAuth: true }
      );
      context = response.representative;
      approved = context.status === 'approved';
    } catch (cause) {
      error = cause instanceof ApiError && cause.status === 404
        ? get(_)('representative.notFound')
        : get(_)('representative.connectionError');
    } finally {
      loading = false;
    }
  }

  async function approve(): Promise<void> {
    if (!context || approving) return;
    approving = true;
    try {
      await api.post(`/draws/represent/${$page.params.token}/approve`, undefined, { skipAuth: true });
      approved = true;
      await hapticMedium();
    } catch (cause) {
      error = cause instanceof ApiError && [409, 410].includes(cause.status)
        ? get(_)('representative.usedOrExpired')
        : get(_)('representative.connectionError');
    } finally {
      approving = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<svelte:head>
  <title>{$_('representative.pageTitle')}</title>
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="represent-page min-h-[100dvh] overflow-hidden bg-[#e9faf5] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#142a25]">
  <div class="mx-auto flex min-h-[calc(100dvh-48px)] max-w-md flex-col">
    <header class="flex items-start justify-between pt-2">
      <div class="min-w-0 pr-4">
        <p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0c9f7d]">{$_('representative.eyebrow')}</p>
        <h1 class="mt-1 truncate text-xl font-black tracking-[-0.03em]">{context?.raffleName ?? $_('representative.loadingRaffle')}</h1>
      </div>
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0c9f7d] shadow-sm"><ShieldCheck size={21} /></span>
    </header>

    {#if error}
      <section class="my-auto text-center" in:fade={{ duration: 160 }}>
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#d85353] shadow-sm"><LockKeyhole size={27} /></span>
        <h2 class="mt-5 text-xl font-black">{$_('representative.unavailable')}</h2>
        <p class="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#60746f]">{error}</p>
      </section>
    {:else if loading}
      <div class="my-auto flex flex-col items-center gap-3 py-8">
        <div class="h-12 w-12 animate-spin rounded-full border-4 border-[#bddfd5] border-t-[#0c9f7d]"></div>
        <p class="text-xs font-bold text-[#60746f]">{$_('representative.loading')}</p>
      </div>
    {:else if context}
      <section class="mt-8 border-y border-[#bddfd5] py-4">
        <p class="text-center text-sm font-black text-[#0c9f7d]">
          {$_('draw.tierPrize', { values: { ordinal: $_('raffle.ordinal', { values: { tier: context.tier } }), prize: context.prizeName } })}
        </p>
        {#if context.status !== 'approved' && context.expiresAt}
          <div class="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#60746f]">
            <Clock3 size={14} /> {$_('representative.expiresAt', { values: { time: new Intl.DateTimeFormat('en-ET', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Addis_Ababa' }).format(new Date(context.expiresAt)) } })}
          </div>
        {/if}
      </section>

      <div class="my-auto flex flex-col items-center py-8 text-center">
        {#if approved}
          <div in:fade={{ duration: 220 }}>
            <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#0c9f7d] shadow-sm"><CheckCircle2 size={27} /></span>
            <h2 class="mt-5 text-xl font-black">{$_('representative.approvedTitle')}</h2>
            <p class="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#60746f]">{$_('representative.approvedBody')}</p>
          </div>
        {:else if context.status === 'expired' || !context.canApprove}
          <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#d85353] shadow-sm"><LockKeyhole size={27} /></span>
          <h2 class="mt-5 text-xl font-black">{$_('representative.unavailable')}</h2>
          <p class="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#60746f]">{$_('representative.usedOrExpired')}</p>
        {:else}
          <p class="mx-auto max-w-xs text-sm leading-6 text-[#60746f]">{$_('representative.explainer')}</p>
          <button
            type="button"
            disabled={approving}
            on:click={approve}
            class="tappable pressable mt-6 flex h-14 min-w-56 items-center justify-center gap-2 rounded-2xl bg-[#0c9f7d] px-8 text-base font-black text-white shadow-[0_12px_30px_rgba(12,159,125,0.35)] disabled:opacity-60"
          >
            {approving ? $_('representative.approving') : $_('representative.approveButton')}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</main>
