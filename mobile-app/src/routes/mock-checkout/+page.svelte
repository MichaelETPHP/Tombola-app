<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { api } from '$lib/api/client.js';
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ArrowLeft, Check, ChevronRight, CircleAlert, FlaskConical, LockKeyhole, ReceiptText, ShieldCheck, Smartphone } from 'lucide-svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';

  let txRef = '';
  let amount = 0;
  let raffleTitle = '';
  let ticketCount = 1;
  let unitPrice = 0;
  let callbackUrl = '';
  let returnUrl = '';
  let mockSecret = '';
  let submitting = false;
  let loadError = '';
  let submitError = '';
  let outcome: 'success' | 'failed' | null = null;
  let redirectTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    txRef = params.get('tx_ref') ?? '';
    amount = Number(params.get('amount') ?? 0);
    raffleTitle = params.get('raffle_title') ?? get(_)('mockCheckout.defaultRaffleTitle');
    ticketCount = Math.max(1, Math.min(4, Number(params.get('ticket_count') ?? 1)));
    unitPrice = Number(params.get('unit_price') ?? amount / ticketCount);
    callbackUrl = params.get('callback_url') ?? '';
    returnUrl = params.get('return_url') ?? '';
    mockSecret = params.get('mock_secret') ?? '';

    if (!txRef || !callbackUrl || !returnUrl || !Number.isFinite(amount) || amount <= 0) {
      loadError = get(_)('mockCheckout.incompleteRequest');
    }
  });

  onDestroy(() => clearTimeout(redirectTimer));

  function returnToApp() {
    try {
      const target = new URL(returnUrl, window.location.origin);
      if (target.origin !== window.location.origin) throw new Error('Unsafe return URL');
      goto(`${target.pathname}${target.search}`);
    } catch {
      goto('/tickets');
    }
  }

  async function finish(status: 'success' | 'failed') {
    if (submitting) return;
    hapticMedium();
    submitting = true;
    submitError = '';
    try {
      const paymentId = new URL(returnUrl, window.location.origin).searchParams.get('payment_id');
      if (!paymentId) throw new Error('Missing payment_id in return URL');
      await api.post(`/payments/${paymentId}/start`);
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Only present on a deployment that opted in (MOCK_PAYMENTS_SECRET
          // set server-side) — authorizes this confirmation without a real
          // Chapa signature. See payments.routes.ts.
          ...(mockSecret ? { 'x-mock-payment-secret': mockSecret } : {}),
        },
        body: JSON.stringify({
          event: status === 'success' ? 'charge.success' : 'charge.failed',
          tx_ref: txRef,
          status,
          amount,
          currency: 'ETB',
        }),
      });
      if (!response.ok) throw new Error('Confirmation rejected');
      outcome = status;
      redirectTimer = setTimeout(returnToApp, 850);
    } catch {
      submitError = get(_)('mockCheckout.gatewayUnreachable');
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>{$_('mockCheckout.pageTitle')}</title></svelte:head>

<main class="checkout-shell min-h-[100dvh] bg-[#f2f6f4] text-[#17201e]">
  <div class="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(44px,var(--safe-top))]">
    <header class="flex h-11 items-center justify-between">
      <button type="button" class="pressable flex h-11 w-11 items-center justify-center rounded-full text-[#17201e]" aria-label={$_('mockCheckout.backAria')} on:click={() => { hapticLight(); history.back(); }}><ArrowLeft size={21} strokeWidth={2} /></button>
      <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#63716d]"><LockKeyhole size={13} /> {$_('mockCheckout.secureCheckout')}</div>
      <span class="flex h-8 items-center gap-1.5 rounded-full bg-[#fff3d6] px-2.5 text-[10px] font-bold uppercase tracking-wide text-[#946414]"><FlaskConical size={12} /> {$_('mockCheckout.testBadge')}</span>
    </header>

    {#if loadError}
      <section class="flex flex-1 flex-col items-center justify-center px-5 text-center" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
        <span class="mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#ffe1e6] text-[#d84d65]"><CircleAlert size={25} /></span>
        <h1 class="text-xl font-extrabold tracking-[-0.025em]">{$_('mockCheckout.unavailable')}</h1>
        <p class="mt-2 text-sm leading-6 text-[#63716d]">{loadError}</p>
        <button type="button" class="pressable mt-6 h-12 w-full rounded-2xl bg-[#17201e] text-sm font-bold text-white" on:click={() => goto('/raffles')}>{$_('mockCheckout.browseRaffles')}</button>
      </section>
    {:else if outcome}
      <section class="flex flex-1 flex-col items-center justify-center px-5 text-center" transition:fly={{ y: 12, duration: 250, easing: cubicOut }}>
        <span class="checkout-result mb-5 flex h-20 w-20 items-center justify-center rounded-full {outcome === 'success' ? 'bg-[#dff7ee] text-[#00a77d]' : 'bg-[#ffe1e6] text-[#d84d65]'}">
          {#if outcome === 'success'}<Check size={35} strokeWidth={2.4} />{:else}<CircleAlert size={32} />{/if}
        </span>
        <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-[#00a77d]">{$_('mockCheckout.gatewayResponse')}</p>
        <h1 class="mt-2 text-2xl font-extrabold tracking-[-0.03em]">{outcome === 'success' ? $_('mockCheckout.paymentConfirmed') : $_('mockCheckout.paymentDeclined')}</h1>
        <p class="mt-2 max-w-[300px] text-sm leading-6 text-[#63716d]">{outcome === 'success' ? $_('mockCheckout.issuingTickets') : $_('mockCheckout.noTicketsIssued')}</p>
        <div class="mt-7 flex items-center gap-2 text-xs font-semibold text-[#63716d]"><span class="checkout-pulse h-2 w-2 rounded-full bg-[#00b589]"></span> {$_('mockCheckout.returningToApp')}</div>
      </section>
    {:else}
      <div class="flex flex-1 flex-col">
        <section class="pb-5 pt-4">
          <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-[#00a77d]">{$_('mockCheckout.amountToPay')}</p>
          <div class="mt-1 flex items-end gap-2"><span class="text-[38px] font-extrabold leading-none tracking-[-0.045em]">{formatEtb(amount)}</span><span class="pb-1 text-sm font-bold text-[#63716d]">ETB</span></div>
        </section>

        <section class="overflow-hidden rounded-[24px] border border-[#dce6e2] bg-white shadow-[0_14px_34px_rgba(39,73,63,0.06)]">
          <div class="p-5">
            <div class="flex items-start gap-3.5">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#dff7ee] text-[#00a77d]"><ReceiptText size={20} /></span>
              <div class="min-w-0"><p class="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b9692]">{$_('mockCheckout.yourEntry')}</p><h1 class="mt-1 line-clamp-2 text-[15px] font-extrabold leading-5">{raffleTitle}</h1></div>
            </div>
          </div>
          <div class="ticket-perforation checkout-perforation"></div>
          <dl class="space-y-3 px-5 py-4 text-[13px]">
            <div class="flex justify-between"><dt class="text-[#63716d]">{$_('mockCheckout.tickets')}</dt><dd class="font-bold">{ticketCount} × {formatEtb(unitPrice)} ETB</dd></div>
            <div class="flex justify-between"><dt class="text-[#63716d]">{$_('mockCheckout.paymentMethod')}</dt><dd class="flex items-center gap-1.5 font-bold"><Smartphone size={14} class="text-[#00a77d]" /> {$_('mockCheckout.chapaTest')}</dd></div>
            <div class="flex justify-between"><dt class="text-[#63716d]">{$_('mockCheckout.reference')}</dt><dd class="max-w-[180px] truncate font-mono text-[11px] font-semibold text-[#63716d]">{txRef}</dd></div>
          </dl>
          <div class="flex items-center gap-2.5 border-t border-[#edf2f0] bg-[#f8faf9] px-5 py-3 text-[11px] leading-4 text-[#63716d]"><ShieldCheck size={16} class="shrink-0 text-[#00a77d]" /> {$_('mockCheckout.issuedAfterConfirmation')}</div>
        </section>

        <div class="mt-auto pt-5">
          {#if submitError}<p class="mb-3 rounded-xl border border-[#f5c8cf] bg-[#fff0f2] px-3.5 py-3 text-xs leading-5 text-[#b93f54]" role="alert">{submitError}</p>{/if}
          <button type="button" disabled={submitting} on:click={() => finish('success')} class="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#17201e] text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(23,32,30,0.16)] disabled:opacity-60">
            {submitting ? $_('mockCheckout.confirmingTest') : $_('mockCheckout.payAmount', { values: { amount: formatEtb(amount) } })} {#if !submitting}<ChevronRight size={18} />{/if}
          </button>
          <button type="button" disabled={submitting} on:click={() => finish('failed')} class="pressable mt-2.5 h-11 w-full text-xs font-bold text-[#8b9692] disabled:opacity-50">{$_('mockCheckout.simulateDecline')}</button>
          <p class="mt-2 text-center text-[10px] leading-4 text-[#8b9692]">{$_('mockCheckout.devOnlyNotice')}</p>
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(body) { background: #f2f6f4; }
  .checkout-perforation::before, .checkout-perforation::after { background: #f2f6f4; }
  .checkout-result { animation: result-in 380ms var(--ease-out) both; }
  .checkout-pulse { animation: checkout-pulse 1.2s var(--ease-in-out) infinite; }
  @keyframes result-in { from { opacity: 0; transform: scale(0.76); } to { opacity: 1; transform: scale(1); } }
  @keyframes checkout-pulse { 50% { opacity: 0.35; transform: scale(0.8); } }
  @media (max-height: 700px) {
    .checkout-shell section:first-of-type { padding-top: 8px; padding-bottom: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .checkout-result, .checkout-pulse { animation: none; }
  }
</style>
