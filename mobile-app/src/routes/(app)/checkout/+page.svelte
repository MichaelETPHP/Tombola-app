<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { AlertCircle, ArrowLeft, Check, LockKeyhole, RefreshCw, ShieldCheck, Ticket } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();
  const CHAPA_SCRIPT_SRC = 'https://js.chapa.co/v1/inline.js';
  const CONTAINER_ID = 'chapa-inline-form';
  const PAYMENT_METHODS = ['telebirr', 'cbebirr', 'ebirr', 'mpesa'];
  const LOAD_TIMEOUT_MS = 15000;
  // Chapa public keys are intentionally shipped to clients. The environment
  // value supports key rotation; this live key keeps deployed Docker builds
  // working even when a Vite build variable was not configured.
  const CHAPA_PUBLIC_KEY = (import.meta.env.VITE_CHAPA_PUBLIC_KEY as string | undefined)
    || 'CHAPUBK-c6qHDsRX8gS7SmcXPD4oWzdXKRvusOR0';

  let paymentId = '';
  let amount = 0;
  let txRef = '';
  let ticketCount = 0;
  let raffleTitle = '';
  let invalid = false;
  let reservationError = false;
  let reservationLoaded = false;
  let ready = false;
  let loading = true;
  let cancelling = false;
  let resolved = false;
  let loadError = '';
  let paymentError = '';
  let renderObserver: MutationObserver | undefined;
  let scriptTimeout: ReturnType<typeof setTimeout> | undefined;

  type ReservedPayment = {
    id: string;
    raffleTitle: string;
    ticketCount: number;
    amount: number;
    gateway: string;
    txRef: string | null;
    status: string;
  };

  function clearRuntimeChecks(): void {
    renderObserver?.disconnect();
    clearTimeout(scriptTimeout);
  }

  function loadChapaScript(forceReload = false): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.ChapaCheckout && !forceReload) {
        resolve();
        return;
      }

      let script = document.querySelector<HTMLScriptElement>(`script[src="${CHAPA_SCRIPT_SRC}"]`);
      if (forceReload && script) {
        script.remove();
        script = null;
      }

      const finish = () => {
        clearTimeout(scriptTimeout);
        window.ChapaCheckout ? resolve() : reject(new Error('Chapa checkout did not initialize'));
      };
      const fail = () => {
        clearTimeout(scriptTimeout);
        reject(new Error('Chapa checkout script could not be loaded'));
      };

      if (!script) {
        script = document.createElement('script');
        script.src = CHAPA_SCRIPT_SRC;
        script.async = true;
        script.dataset.chapaInline = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', fail, { once: true });
      scriptTimeout = setTimeout(fail, LOAD_TIMEOUT_MS);
    });
  }

  async function initializeCheckout(forceReload = false): Promise<void> {
    if (invalid) return;
    clearRuntimeChecks();
    ready = false;
    loading = true;
    loadError = '';
    paymentError = '';

    try {
      await loadChapaScript(forceReload);
      if (!window.ChapaCheckout) throw new Error('Chapa checkout is unavailable');
      const container = document.getElementById(CONTAINER_ID);
      if (!container) throw new Error('Payment form container is unavailable');

      // Chapa owns this element completely. Keep Svelte loading UI outside it.
      container.replaceChildren();
      const markReady = () => {
        if (container.querySelector('#chapa-pay-button')) {
          ready = true;
          loading = false;
          renderObserver?.disconnect();
        }
      };
      renderObserver = new MutationObserver(markReady);
      renderObserver.observe(container, { childList: true, subtree: true });

      const chapa = new window.ChapaCheckout({
        publicKey: CHAPA_PUBLIC_KEY,
        amount: String(amount),
        currency: 'ETB',
        tx_ref: txRef,
        mobile: $auth.user?.phone || undefined,
        availablePaymentMethods: PAYMENT_METHODS,
        showFlag: true,
        showPaymentMethodsNames: true,
        customizations: {
          buttonText: `Pay ${formatEtb(amount)} ETB`,
          successMessage: 'Payment received. Confirming your tickets…',
          styles: `
            #chapa-inline-form { color: #1a1d29; font-family: inherit; }
            .chapa-phone-input-wrapper { min-height: 54px; margin-bottom: 16px; border: 1px solid #d9dce3; border-radius: 14px; box-shadow: none; }
            .chapa-phone-input-wrapper:hover { border-color: #00b589; box-shadow: 0 0 0 3px rgba(0,181,137,.12); }
            .chapa-phone-prefix { font-size: 15px; color: #555b6e; }
            .chapa-phone-input { min-height: 44px; font-size: 16px; color: #1a1d29; }
            .chapa-payment-methods-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin: 12px 0 18px; }
            .chapa-payment-method { box-sizing: border-box; width: 100%; height: 76px; padding: 8px 4px; border: 1px solid #e1e4ea; border-radius: 14px; box-shadow: none; }
            .chapa-payment-method:active { transform: scale(.97); }
            .chapa-payment-icon { width: 34px; height: 34px; object-fit: contain; margin-bottom: 5px; }
            .chapa-payment-name { font-size: 10px; font-weight: 700; color: #555b6e; }
            .chapa-selected { background: #dff7ee; border-color: #00b589; box-shadow: inset 0 0 0 1px #00b589; }
            .chapa-pay-button { min-height: 54px; border: 0; border-radius: 16px; background: #00d3a0; color: #10211d; font-size: 15px; font-weight: 800; box-shadow: 0 10px 22px -14px rgba(0,105,80,.72), inset 0 1px 0 rgba(255,255,255,.72); }
            .chapa-pay-button:hover { background: #00c496; }
            .chapa-pay-button:disabled { opacity: .58; cursor: wait; }
            .chapa-error { margin: 8px 0 12px; color: #c33c57; font-size: 12px; line-height: 1.5; }
            .chapa-loading { margin-top: 14px; color: #555b6e; font-size: 12px; }
            .chapa-spinner { border-top-color: #00b589; }
            @media (max-width: 360px) { .chapa-payment-methods-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
          `,
        },
        // This remains on our own origin inside the same WebView. It verifies
        // the server-side payment before showing the issued ticket receipt.
        returnUrl: `${window.location.origin}/payment-return?payment_id=${encodeURIComponent(paymentId)}&target=web`,
        onSuccessfulPayment: () => {
          resolved = true;
        },
        onPaymentFailure: (message) => {
          paymentError = message || 'Payment was not completed. Check the number and try again.';
        },
      });

      chapa.initialize(CONTAINER_ID);
      // initialize() renders synchronously in Chapa Inline.js. Check now so
      // we cannot miss the mutation before the observer starts.
      markReady();
      if (!ready) throw new Error('Chapa did not render the payment form');
    } catch (cause) {
      loading = false;
      loadError = cause instanceof Error ? cause.message : 'The secure payment form could not be loaded';
      clearRuntimeChecks();
    }
  }

  async function cancel(): Promise<void> {
    if (cancelling) return;
    cancelling = true;
    resolved = true;
    if (paymentId) await cancelPaymentAndReturnHome(paymentId);
    else await goto('/raffles');
  }

  async function loadReservation(): Promise<void> {
    loading = true;
    reservationError = false;
    try {
      const { payment } = await api.get<{ payment: ReservedPayment }>(`/payments/${paymentId}`);
      if (payment.status === 'completed') {
        resolved = true;
        await goto(`/payments/${paymentId}`, { replaceState: true });
        return;
      }
      amount = Number(payment.amount);
      txRef = payment.txRef ?? '';
      ticketCount = Number(payment.ticketCount);
      raffleTitle = payment.raffleTitle?.trim() ?? '';
      reservationLoaded = true;
      invalid = payment.gateway !== 'chapa'
        || payment.status !== 'pending'
        || !txRef
        || !Number.isFinite(amount)
        || amount <= 0
        || !Number.isInteger(ticketCount)
        || ticketCount < 1
        || ticketCount > 5;
      if (invalid) loading = false;
      else await initializeCheckout();
    } catch {
      reservationError = true;
      reservationLoaded = false;
      loading = false;
    }
  }

  onMount(async () => {
    pullRefresh.set(null);
    const params = $page.url.searchParams;
    paymentId = params.get('paymentId') ?? '';
    invalid = !/^[0-9a-f-]{36}$/i.test(paymentId);
    if (invalid) {
      loading = false;
      return;
    }
    await loadReservation();
  });

  onDestroy(() => {
    clearRuntimeChecks();
    if (!resolved && !invalid && paymentId) api.post(`/payments/${paymentId}/cancel`).catch(() => undefined);
  });
</script>

<svelte:head><title>Secure checkout · YeneEta</title></svelte:head>

<section class="checkout-page flex min-h-0 flex-col">
  <header class="flex h-12 shrink-0 items-center justify-between">
    <button type="button" class="pressable flex h-11 w-11 items-center justify-center rounded-full bg-white/75 text-ink disabled:opacity-50" aria-label="Cancel checkout and go back" disabled={cancelling} on:click={cancel}>
      <ArrowLeft size={20} />
    </button>
    <div class="flex items-center gap-1.5 text-xs font-bold text-muted"><LockKeyhole size={14} class="text-primary-dark" /> Secure checkout</div>
    <span class="h-11 w-11" aria-hidden="true"></span>
  </header>

  {#if reservationError}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert">
      <AlertCircle size={30} class="text-pink" />
      <h1 class="mt-4 text-lg font-extrabold text-ink">Could not load your reservation</h1>
      <p class="mt-2 max-w-[280px] text-sm leading-6 text-muted">Keep this page open, check your connection, and try again.</p>
      <button type="button" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={loadReservation}>
        <RefreshCw size={16} /> Retry checkout
      </button>
    </div>
  {:else if !reservationLoaded && !invalid}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-muted" aria-live="polite">
      <div class="h-7 w-7 animate-spin rounded-full border-[3px] border-dot-inactive border-t-primary-dark"></div>
      <p class="text-sm font-semibold">Loading your ticket reservation…</p>
    </div>
  {:else if invalid}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert">
      <AlertCircle size={30} class="text-pink" />
      <h1 class="mt-4 text-lg font-extrabold text-ink">Checkout details are incomplete</h1>
      <p class="mt-2 max-w-[280px] text-sm leading-6 text-muted">Return to the raffle and select your tickets again.</p>
      <button type="button" class="pressable mt-5 min-h-11 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={cancel}>Back to raffles</button>
    </div>
  {:else}
    <div class="mt-3 flex items-start justify-between gap-4 border-b border-dot-inactive/70 pb-4">
      <div class="min-w-0">
        <h1 class="line-clamp-2 text-lg font-extrabold leading-6 tracking-[-0.025em] text-ink">{raffleTitle || 'Raffle tickets'}</h1>
        <p class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><Ticket size={14} /> {ticketCount} ticket{ticketCount === 1 ? '' : 's'}</p>
      </div>
      <div class="shrink-0 text-right">
        <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Total</p>
        <p class="mt-0.5 text-xl font-extrabold tabular-nums text-ink">{formatEtb(amount)}</p>
        <p class="text-[10px] font-bold text-muted">ETB</p>
      </div>
    </div>

    <div class="mt-4 flex items-center gap-2 text-xs font-semibold text-muted">
      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-action-bg text-primary-dark"><Check size={13} strokeWidth={3} /></span>
      Select a payment method and confirm on your phone
    </div>

    {#if paymentError}
      <div class="mt-3 flex items-start gap-2 rounded-[14px] bg-pink-bg px-3 py-2.5 text-xs leading-5 text-pink" role="alert">
        <AlertCircle size={16} class="mt-0.5 shrink-0" /> <span>{paymentError}</span>
      </div>
    {/if}

    <div class="relative mt-4 min-h-[250px] flex-1">
      {#if loading}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted" aria-live="polite">
          <div class="h-7 w-7 animate-spin rounded-full border-[3px] border-dot-inactive border-t-primary-dark"></div>
          <p class="text-sm font-semibold">Preparing payment methods…</p>
        </div>
      {/if}

      {#if loadError}
        <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" role="alert">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-pink-bg text-pink"><AlertCircle size={24} /></span>
          <h2 class="mt-4 text-base font-extrabold text-ink">Payment form did not load</h2>
          <p class="mt-2 max-w-[290px] text-sm leading-6 text-muted">Keep this page open, check your connection, then retry securely inside the app.</p>
          <button type="button" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={() => initializeCheckout(true)}>
            <RefreshCw size={16} /> Retry payment form
          </button>
        </div>
      {/if}

      <div id={CONTAINER_ID} class:hidden={!ready} class="chapa-inline-container pb-4" aria-label="Chapa payment form"></div>
    </div>

    <footer class="flex shrink-0 items-center justify-center gap-1.5 border-t border-dot-inactive/60 py-3 text-[11px] font-semibold text-muted">
      <ShieldCheck size={13} class="text-primary-dark" /> Payment status is verified before tickets are issued
    </footer>
  {/if}
</section>

<style>
  .checkout-page { height: calc(100dvh - max(44px, var(--safe-top)) - 28px); }
  .chapa-inline-container { overflow: visible; }
  :global(html:has(.checkout-page) .bottom-nav) { display: none; }
  :global(html:has(.checkout-page) .native-bottom-nav-clearance) { padding-bottom: max(20px, var(--safe-bottom)); }
  :global(.checkout-page *:focus-visible) { outline: 3px solid rgba(0, 181, 137, .28); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .checkout-page :global(.animate-spin) { animation-duration: 1.5s; } }
</style>
