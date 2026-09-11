<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { beforeNavigate, goto } from '$app/navigation';
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
  // Chapa's own initialize() usually paints #chapa-pay-button synchronously,
  // but not always — a slower connection/device can add a real beat before
  // its internal setup finishes. The old code checked once, immediately
  // after initialize(), and failed the whole checkout if that single check
  // missed by even a few hundred ms. This grace period lets the observer
  // that's already watching the container actually catch a delayed render
  // instead of racing it.
  const RENDER_GRACE_MS = 8000;
  // Chapa public keys are intentionally shipped to clients. The environment
  // value supports key rotation; this live key keeps deployed Docker builds
  // working even when a Vite build variable was not configured.
  const CHAPA_PUBLIC_KEY = (import.meta.env.VITE_CHAPA_PUBLIC_KEY as string | undefined)
    || 'CHAPUBK-c6qHDsRX8gS7SmcXPD4oWzdXKRvusOR0';

  // The widget's own phone field already shows a fixed +251 prefix badge —
  // prefilling it with this app's stored E.164 number (which already
  // starts with +251) put the country code in front of the visitor twice.
  // Chapa's own form expects the LOCAL 0-prefixed form for this value.
  function toLocalEthiopianPhone(phone: string): string | undefined {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('251') && digits.length === 12) return `0${digits.slice(3)}`;
    if (digits.length === 9) return `0${digits}`;
    if (digits.length === 10 && digits.startsWith('0')) return digits;
    return undefined;
  }

  let paymentId = '';
  let amount = 0;
  let txRef = '';
  let ticketCount = 0;
  let raffleTitle = '';
  let selectedNumbers: number[] = [];
  let selectedDisplayNumbers: string[] = [];
  let expiresAt = '';
  let checkoutStarted = false;
  let now = Date.now();
  let serverOffset = 0;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  $: secondsLeft = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  $: countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
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
    selectedNumbers?: number[];
    selectedDisplayNumbers?: string[];
    expiresAt?: string;
    checkoutStarted?: boolean;
    serverTime?: string;
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
      await api.post(`/payments/${paymentId}/start`);
      checkoutStarted = true;
      if (!window.ChapaCheckout) throw new Error('Chapa checkout is unavailable');
      const container = document.getElementById(CONTAINER_ID);
      if (!container) throw new Error('Payment form container is unavailable');

      // Chapa owns this element completely. Keep Svelte loading UI outside it.
      container.replaceChildren();

      const chapa = new window.ChapaCheckout({
        publicKey: CHAPA_PUBLIC_KEY,
        amount: String(amount),
        currency: 'ETB',
        tx_ref: txRef,
        mobile: $auth.user?.phone ? toLocalEthiopianPhone($auth.user.phone) : undefined,
        availablePaymentMethods: PAYMENT_METHODS,
        showFlag: true,
        showPaymentMethodsNames: true,
        customizations: {
          buttonText: get(_)('checkout.payButton', { values: { amount: formatEtb(amount) } }),
          successMessage: get(_)('checkout.paymentReceived'),
          styles: `
            #chapa-inline-form { color: #1a1d29; font-family: inherit; }
            /* The +251 prefix badge and the typed digits were rendering on
               top of each other — the wrapper needed to actually lay its
               children out side by side instead of leaving that to
               whatever positioning the input itself came with. */
            .chapa-phone-input-wrapper { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 0 14px; margin-bottom: 16px; border: 1px solid #d9dce3; border-radius: 14px; box-shadow: none; transition: border-color 160ms ease, box-shadow 160ms ease; }
            .chapa-phone-input-wrapper:hover, .chapa-phone-input-wrapper:focus-within { border-color: #00b589; box-shadow: 0 0 0 3px rgba(0,181,137,.12); }
            .chapa-phone-prefix { flex: 0 0 auto; font-size: 15px; color: #555b6e; white-space: nowrap; }
            .chapa-phone-input { flex: 1 1 auto; min-width: 0; min-height: 44px; padding: 0; border: 0; background: transparent; font-size: 16px; color: #1a1d29; }
            .chapa-payment-methods-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin: 12px 0 18px; }
            .chapa-payment-method { box-sizing: border-box; width: 100%; height: 76px; padding: 8px 4px; border: 1px solid #e1e4ea; border-radius: 14px; box-shadow: none; transition: transform 120ms ease-out, border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease; }
            .chapa-payment-method:active { transform: scale(.96); }
            .chapa-payment-icon { width: 34px; height: 34px; object-fit: contain; margin-bottom: 5px; }
            .chapa-payment-name { font-size: 10px; font-weight: 700; color: #555b6e; }
            .chapa-selected { background: #dff7ee; border-color: #00b589; box-shadow: inset 0 0 0 1px #00b589; }
            .chapa-pay-button { min-height: 54px; border: 0; border-radius: 16px; background: #00d3a0; color: #10211d; font-size: 15px; font-weight: 800; box-shadow: 0 10px 22px -14px rgba(0,105,80,.72), inset 0 1px 0 rgba(255,255,255,.72); transition: transform 140ms ease-out, background-color 160ms ease; }
            .chapa-pay-button:hover { background: #00c496; }
            .chapa-pay-button:active { transform: scale(.98); }
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
          paymentError = message || get(_)('checkout.paymentFailedReleasing');
          void cancel();
        },
      });

      chapa.initialize(CONTAINER_ID);

      const rendered = container.querySelector('#chapa-pay-button')
        ? true
        : await new Promise<boolean>((resolve) => {
            const observer = new MutationObserver(() => {
              if (container.querySelector('#chapa-pay-button')) {
                observer.disconnect();
                clearTimeout(graceTimer);
                resolve(true);
              }
            });
            renderObserver = observer;
            observer.observe(container, { childList: true, subtree: true });
            const graceTimer = setTimeout(() => {
              observer.disconnect();
              resolve(false);
            }, RENDER_GRACE_MS);
          });

      if (!rendered) throw new Error('Chapa did not render the payment form');
      ready = true;
      loading = false;
      renderObserver?.disconnect();
    } catch {
      // Whatever the internal reason (script load failure, Chapa init
      // failure, render timeout), none of the specific English reasons are
      // more actionable to the user than this one translated message.
      loading = false;
      loadError = $_('checkout.formLoadError');
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

  beforeNavigate((navigation) => {
    // Back/gesture navigation is an explicit checkout cancellation. The gateway
    // return and receipt routes are confirmation paths, not cancellation.
    const destination = navigation.to?.url.pathname ?? '';
    if (resolved || cancelling || !paymentId || navigation.willUnload || destination === '/payment-return' || destination === `/payments/${paymentId}`) return;
    navigation.cancel();
    void cancel();
  });

  async function loadReservation(): Promise<void> {
    loading = true;
    reservationError = false;
    try {
      const { payment } = await api.get<{ payment: ReservedPayment }>(`/payments/${paymentId}`);
      if (payment.status === 'completed' || payment.status === 'review') {
        resolved = true;
        await goto(`/payments/${paymentId}`, { replaceState: true });
        return;
      }
      selectedNumbers = payment.selectedNumbers ?? [];
      selectedDisplayNumbers = payment.selectedDisplayNumbers ?? selectedNumbers.map((n) => String(n).padStart(5, '0'));
      expiresAt = payment.expiresAt ?? '';
      checkoutStarted = !!payment.checkoutStarted;
      serverOffset = payment.serverTime ? new Date(payment.serverTime).getTime() - Date.now() : 0;
      now = Date.now() + serverOffset;
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
      else if (checkoutStarted) {
        resolved = true;
        await goto(`/payments/${paymentId}`, { replaceState: true });
      } else {
        // Skip the extra "Continue to payment" tap — go straight from the
        // ticket summary into loading the payment methods.
        await initializeCheckout();
      }
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
    countdownTimer = setInterval(() => { now = Date.now() + serverOffset; }, 1000);
  });

  onDestroy(() => {
    clearRuntimeChecks();
    clearInterval(countdownTimer);
    // Navigation is not proof that a gateway charge failed. Keep server state.
  });
</script>

<svelte:head><title>{$_('checkout.pageTitle')}</title></svelte:head>

<section class="checkout-page flex min-h-0 flex-col">
  <header class="flex h-12 shrink-0 items-center justify-between">
    <button type="button" class="pressable flex h-11 w-11 items-center justify-center rounded-full bg-white/75 text-ink disabled:opacity-50" aria-label={$_('checkout.cancelAria')} disabled={cancelling} on:click={cancel}>
      <ArrowLeft size={20} />
    </button>
    <div class="flex items-center gap-1.5 text-xs font-bold text-muted"><LockKeyhole size={14} class="text-primary-dark" /> {$_('checkout.secureCheckout')}</div>
    <span class="h-11 w-11" aria-hidden="true"></span>
  </header>

  {#if reservationError}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert">
      <AlertCircle size={30} class="text-pink" />
      <h1 class="mt-4 text-lg font-extrabold text-ink">{$_('checkout.reservationLoadErrorTitle')}</h1>
      <p class="mt-2 max-w-[280px] text-sm leading-6 text-muted">{$_('checkout.reservationLoadErrorBody')}</p>
      <button type="button" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={loadReservation}>
        <RefreshCw size={16} /> {$_('checkout.retryCheckout')}
      </button>
    </div>
  {:else if !reservationLoaded && !invalid}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-muted" aria-live="polite">
      <div class="h-7 w-7 animate-spin rounded-full border-[3px] border-dot-inactive border-t-primary-dark"></div>
      <p class="text-sm font-semibold">{$_('checkout.loadingReservation')}</p>
    </div>
  {:else if invalid}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert">
      <AlertCircle size={30} class="text-pink" />
      <h1 class="mt-4 text-lg font-extrabold text-ink">{$_('checkout.incompleteTitle')}</h1>
      <p class="mt-2 max-w-[280px] text-sm leading-6 text-muted">{$_('checkout.incompleteBody')}</p>
      <button type="button" class="pressable mt-5 min-h-11 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={cancel}>{$_('checkout.backToRaffles')}</button>
    </div>
  {:else}
    <div class="mt-3 overflow-hidden rounded-card border border-dot-inactive/70 bg-card">
      <div class="flex items-start justify-between gap-4 p-4">
        <div class="min-w-0">
          <h1 class="line-clamp-2 text-base font-extrabold leading-6 tracking-[-0.025em] text-ink">{raffleTitle || $_('checkout.defaultRaffleTitle')}</h1>
          <p class="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Ticket size={13} /> {$_('checkout.ticketCount', { values: { n: ticketCount } })}{#if ticketCount > 0} · {$_('checkout.eachPrice', { values: { amount: formatEtb(amount / ticketCount) } })}{/if}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{$_('checkout.total')}</p>
          <p class="mt-0.5 text-xl font-extrabold tabular-nums text-ink">{formatEtb(amount)}</p>
          <p class="text-[10px] font-bold text-muted">ETB</p>
        </div>
      </div>
      {#if selectedNumbers.length}
        <div class="reserved-numbers"><p>{$_('checkout.yourTicketNumbers')}</p><div>{#each selectedDisplayNumbers as code}<span>{code}</span>{/each}</div><small>{checkoutStarted ? $_('checkout.heldWhileConfirmed') : secondsLeft > 0 ? $_('checkout.reservedFor', { values: { countdown } }) : $_('checkout.reservationExpired')}</small></div>
      {/if}
      <div class="flex items-center gap-2 border-t border-dot-inactive/60 bg-bg-start/60 px-4 py-2.5 text-xs font-semibold text-muted">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action-bg text-primary-dark"><Check size={13} strokeWidth={3} /></span>
        {$_('checkout.selectMethodHint')}
      </div>
    </div>

    {#if paymentError}
      <div class="mt-3 flex items-start gap-2 rounded-[14px] bg-pink-bg px-3 py-2.5 text-xs leading-5 text-pink" role="alert">
        <AlertCircle size={16} class="mt-0.5 shrink-0" /> <span>{paymentError}</span>
      </div>
    {/if}

    <div class="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-card border border-dot-inactive/70 bg-card">
      {#if loading}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted" aria-live="polite">
          <div class="h-7 w-7 animate-spin rounded-full border-[3px] border-dot-inactive border-t-primary-dark"></div>
          <p class="text-sm font-semibold">{$_('checkout.preparingMethods')}</p>
        </div>
      {/if}

      {#if loadError}
        <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" role="alert">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-pink-bg text-pink"><AlertCircle size={24} /></span>
          <h2 class="mt-4 text-base font-extrabold text-ink">{$_('checkout.formLoadErrorTitle')}</h2>
          <p class="mt-2 max-w-[290px] text-sm leading-6 text-muted">{$_('checkout.formLoadErrorBody')}</p>
          <button type="button" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={() => initializeCheckout(true)}>
            <RefreshCw size={16} /> {$_('checkout.retryForm')}
          </button>
        </div>
      {/if}

      <div id={CONTAINER_ID} class:hidden={!ready} class="chapa-inline-container h-full p-4" aria-label={$_('checkout.formAria')}></div>
    </div>

    <footer class="shrink-0 border-t border-dot-inactive/60 pb-1 pt-3">
      <p class="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted">
        <ShieldCheck size={13} class="text-primary-dark" /> {$_('checkout.verifiedBeforeIssued')}
      </p>
      <p class="mt-1 text-center text-[10px] font-medium text-muted/70">{$_('checkout.securedBy')}</p>
    </footer>
  {/if}
</section>

<style>
  .reserved-numbers { padding: 0 16px 16px; color: #193c33; }
  .reserved-numbers p { font-size: 12px; font-weight: 700; margin-bottom: 10px; }
  .reserved-numbers > div { display: flex; flex-wrap: wrap; gap: 8px; }
  .reserved-numbers span { padding: 10px 12px; background: #e4f4eb; border-radius: 10px; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .reserved-numbers small { display: block; margin-top: 12px; font-size: 12px; color: #566960; }
  .chapa-inline-container { min-height: 360px; }

  .checkout-page { min-height: calc(100dvh - max(44px, var(--safe-top)) - 28px); padding-bottom: 20px; }
  /* The card around it is a fixed size (flex-1 inside a capped-height
     page) — if the widget's own content (phone field + method grid +
     button) ever needs more room than that, it scrolls inside this card
     instead of growing the card and pushing the page into a scroll. */
  .chapa-inline-container { height: 100%; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  :global(html:has(.checkout-page) .bottom-nav) { display: none; }
  :global(html:has(.checkout-page) .native-bottom-nav-clearance) { padding-bottom: max(20px, var(--safe-bottom)); }
  :global(.checkout-page *:focus-visible) { outline: 3px solid rgba(0, 181, 137, .28); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .checkout-page :global(.animate-spin) { animation-duration: 1.5s; } }
</style>
