<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, ApiError } from '$lib/api/client.js';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { showBanner } from '$lib/stores/banner.store.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import PaperReceipt from '$lib/components/PaperReceipt.svelte';
  import { ArrowLeft, Check, Clock3, ReceiptText, RefreshCw, ShieldCheck, Ticket, X } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();

  interface PaymentStatus {
    id: string;
    raffleId: string;
    raffleTitle: string;
    ticketCount: number;
    ticketNumbers: number[];
    ticketCodes: string[];
    amount: number;
    gateway: 'chapa' | 'telebirr' | 'manual';
    createdAt: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded' | 'review';
  }

  let payment: PaymentStatus | null = null;
  let loadError = false;
  let checking = false;
  let cancelling = false;
  async function cancelReservation() {
    if (cancelling || payment?.status !== 'pending') return;
    cancelling = true;
    stopPolling();
    await cancelPaymentAndReturnHome(payment.id);
    cancelling = false;
  }
  let timedOut = false;
  let bannerShown = false;
  let showReceipt = false;
  const POLL_INTERVAL_MS = 1800;
  const TIMEOUT_MS = 90_000;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  async function checkStatus(verifyGateway = false) {
    checking = true;
    try {
      const path = `/payments/${$page.params.id}`;
      const res = verifyGateway
        ? await api.post<{ payment: PaymentStatus }>(`${path}/verify`)
        : await api.get<{ payment: PaymentStatus }>(path);
      payment = res.payment;
      loadError = false;
      if (res.payment.status !== 'pending') stopPolling();
      if (res.payment.status === 'completed' && !bannerShown) {
        bannerShown = true;
        showReceipt = true;
        showBanner($_('payments.ticketsReadyBanner'));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        loadError = true;
        stopPolling();
      }
    } finally {
      checking = false;
    }
  }

  function stopPolling() {
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
  }

  function restartPolling() {
    timedOut = false;
    loadError = false;
    stopPolling();
    checkStatus(true);
    pollTimer = setInterval(checkStatus, POLL_INTERVAL_MS);
    timeoutTimer = setTimeout(() => { timedOut = true; stopPolling(); }, TIMEOUT_MS);
  }

  function goBack() {
    hapticLight();
    if (payment?.raffleId) goto(`/raffles/${payment.raffleId}`);
    else goto('/raffles');
  }

  function goToRaffle() {
    if (payment) goto(`/raffles/${payment.raffleId}`);
  }

  onMount(() => {
    restartPolling();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && payment?.status === 'pending') checkStatus(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Already polls on its own every 1.8s — a pull gesture here would be
    // redundant, so this page opts out rather than inheriting whatever
    // the previously-visited page left registered.
    pullRefresh.set(null);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  });
  onDestroy(stopPolling);
</script>

<svelte:head><title>{$_('payments.pageTitle')}</title></svelte:head>

<div class="payment-page flex flex-col">
  <header class="flex h-11 items-center justify-between">
    <button type="button" class="pressable flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink" aria-label={$_('payments.backAria')} on:click={goBack}><ArrowLeft size={20} /></button>
    <p class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{$_('payments.headerLabel')}</p>
    <span class="h-11 w-11"></span>
  </header>

  {#if loadError}
    <section class="flex flex-1 flex-col items-center justify-center px-5 text-center" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
      <span class="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-pink-bg text-pink"><X size={28} /></span>
      <h1 class="text-xl font-extrabold tracking-[-0.025em] text-ink">{$_('payments.notFoundTitle')}</h1>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('payments.notFoundBody')}</p>
      <button type="button" class="pressable mt-6 h-12 w-full rounded-button bg-ink text-sm font-bold text-white" on:click={() => goto('/tickets')}>{$_('numbers.viewMyTickets')}</button>
    </section>
  {:else if !payment}
    <div class="flex flex-1 flex-col justify-center gap-4 px-2" aria-busy="true" aria-label={$_('payments.checkingStatusAria')}>
      <Skeleton class="mx-auto h-16 w-16 rounded-full" />
      <Skeleton class="mx-auto h-6 w-44 rounded-full" />
      <Skeleton class="mx-auto h-4 w-64 rounded-full" />
      <Skeleton class="mt-5 h-52 w-full rounded-card" />
    </div>
  {:else if payment.status === 'completed'}
    <section class="flex flex-1 flex-col pt-4" transition:fly={{ y: 10, duration: 240, easing: cubicOut }}>
      <div class="text-center">
        <span class="success-mark mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-action-bg text-primary-dark"><Check size={29} strokeWidth={2.5} /></span>
        <p class="mt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-dark">{$_('payments.confirmedLabel')}</p>
        <h1 class="mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-ink">{$_('payments.inDrawTitle')}</h1>
        <p class="mx-auto mt-1 max-w-[300px] text-xs leading-5 text-muted">{$_('payments.independentChanceBody')}</p>
      </div>

      <div class="mt-5 overflow-hidden rounded-card bg-card shadow-card">
        <div class="px-5 py-4">
          <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{payment.raffleTitle}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            {#each payment.ticketCodes as code (code)}
              <span class="ticket-number flex h-9 items-center gap-1.5 rounded-xl border border-primary/20 bg-action-bg px-3 font-mono text-[11px] font-extrabold text-primary-dark"><Ticket size={13} /> {code}</span>
            {/each}
          </div>
        </div>
        <div class="ticket-perforation"></div>
        <dl class="space-y-2.5 px-5 py-4 text-xs">
          <div class="flex justify-between"><dt class="text-muted">{$_('payments.paidLabel')}</dt><dd class="font-extrabold text-ink">{formatEtb(payment.amount)} ETB</dd></div>
          <div class="flex justify-between"><dt class="text-muted">{$_('payments.methodLabel')}</dt><dd class="font-bold capitalize text-ink">{payment.gateway}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">{$_('payments.receiptLabel')}</dt><dd class="max-w-[170px] truncate font-mono text-[10px] font-semibold text-muted">{payment.id}</dd></div>
        </dl>
      </div>

      <div class="mt-auto space-y-2.5 pt-4">
        <button type="button" class="pressable h-12 w-full rounded-button bg-primary text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(0,181,137,0.18)]" on:click={() => goto('/tickets')}>{$_('payments.viewAllTickets')}</button>
        <button type="button" class="pressable h-11 w-full text-xs font-bold text-muted" on:click={goToRaffle}>{$_('payments.backToRaffleButton')}</button>
      </div>
    </section>
  {:else if payment.status === 'review'}
    <section class="flex flex-1 flex-col justify-center gap-4 py-8">
      <Clock3 size={32} class="text-ink" />
      <h1 class="text-2xl font-bold text-ink">{$_('payments.reviewTitle')}</h1>
      <p class="text-sm leading-6 text-[#566960]">{$_('payments.reviewBody')}</p>
      <p class="break-all text-xs text-[#566960]">{$_('payments.paymentReference', { values: { id: payment.id } })}</p>
      <button class="min-h-12 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={() => goto('/profile')}>{$_('payments.viewPaymentHistory')}</button>
    </section>
  {:else if payment.status === 'failed'  || payment.status === 'refunded'}
    <section class="flex flex-1 flex-col items-center justify-center px-4 text-center" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
      <span class="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-pink-bg text-pink"><X size={28} /></span>
      <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pink">{$_('payments.unsuccessfulLabel')}</p>
      <h1 class="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">{$_('payments.noTicketsTitle')}</h1>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('payments.noTicketsBody')}</p>
      <button type="button" class="pressable mt-6 h-12 w-full rounded-button bg-ink text-sm font-bold text-white" on:click={goToRaffle}>{$_('payments.tryPaymentAgain')}</button>
    </section>
  {:else if timedOut}
    <section class="flex flex-1 flex-col items-center justify-center px-4 text-center" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
      <span class="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-gold-bg text-gold"><Clock3 size={27} /></span>
      <h1 class="text-xl font-extrabold tracking-[-0.025em] text-ink">{$_('payments.delayedTitle')}</h1>
      <p class="mt-2 max-w-[310px] text-sm leading-6 text-muted">{$_('payments.delayedBody')}</p>
      <button type="button" class="pressable mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-button bg-ink text-sm font-bold text-white" on:click={restartPolling}><RefreshCw size={16} /> {$_('payments.checkAgain')}</button>
      <button type="button" class="pressable mt-2 h-11 px-3 text-xs font-bold text-muted" on:click={() => goto('/tickets')}>{$_('payments.checkMyTickets')}</button>
    </section>
  {:else}
    <section class="flex flex-1 flex-col items-center justify-center px-5 text-center" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
      <span class="processing-ring relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/65"><ReceiptText size={25} class="text-primary-dark" /></span>
      <p class="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-dark">{$_('payments.checkingLabel')}</p>
      <h1 class="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">{$_('payments.confirmingTitle')}</h1>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('payments.confirmingBody')}</p>
      <div class="mt-6 flex items-center gap-2 rounded-full bg-white/60 px-3 py-2 text-[11px] font-semibold text-muted"><ShieldCheck size={14} class="text-primary-dark" /> {checking ? $_('payments.confirmationInProgress') : $_('payments.confirmationQueued')}</div>
    </section>
  {/if}
  {#if payment?.status === 'pending'}
    <button type="button" class="mt-3 min-h-12 shrink-0 rounded-xl bg-white/70 px-4 text-sm font-semibold text-[#85434a]" disabled={cancelling} on:click={cancelReservation}>{cancelling ? $_('payments.releasingNumbers') : $_('numbers.cancelRelease')}</button>
  {/if}
</div>

{#if showReceipt && payment}
  <PaperReceipt
    raffleTitle={payment.raffleTitle}
    ticketCodes={payment.ticketCodes}
    amount={payment.amount}
    gateway={payment.gateway}
    receiptId={payment.id}
    createdAt={payment.createdAt}
    onDismiss={() => (showReceipt = false)}
  />
{/if}

<style>
  .payment-page { height: calc(100dvh - max(44px, var(--safe-top)) - 120px); min-height: 0; overflow: hidden; }
  .success-mark { animation: success-pop 420ms var(--ease-out) both; }
  .ticket-number { animation: ticket-in 300ms var(--ease-out) both; }
  .processing-ring::before { content: ''; position: absolute; inset: -5px; border-radius: 999px; border: 2px solid transparent; border-top-color: var(--color-primary-dark); border-right-color: var(--color-primary-dark); animation: receipt-spin 1s linear infinite; }
  @keyframes success-pop { from { opacity: 0; transform: scale(0.72); } to { opacity: 1; transform: scale(1); } }
  @keyframes ticket-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes receipt-spin { to { transform: rotate(360deg); } }
  @media (max-height: 700px) {
    .payment-page { height: calc(100dvh - max(44px, var(--safe-top)) - 108px); }
  }
  @media (prefers-reduced-motion: reduce) { .success-mark, .ticket-number, .processing-ring::before { animation: none; } }
</style>
