<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api } from '$lib/api/client.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { ArrowLeft, ShieldCheck, AlertCircle, Smartphone, ExternalLink } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();

  // Window.ChapaCheckout is declared globally in $lib/types/chapa.d.ts —
  // Chapa's own Inline.js widget (github.com/Chapa-Et/inline.js), loaded
  // from their CDN at runtime, never bundled.

  const CHAPA_SCRIPT_SRC = 'https://js.chapa.co/v1/inline.js';
  const CONTAINER_ID = 'chapa-inline-form';
  // How long to wait for the widget to actually paint its form before
  // treating it as failed. A script-tag load failure is easy to detect;
  // the widget silently not rendering anything into the container (no
  // error thrown, just nothing) is a different failure mode that needs
  // its own check — otherwise the page is left on a spinner forever with
  // no way out, which reads exactly like "won't load."
  const RENDER_TIMEOUT_MS = 6000;
  // Mobile-money methods only. Chapa's generic 'chapa' (card) option falls
  // back to a hidden-form POST that navigates the whole page to
  // api.chapa.co — exactly the "opens in a browser" experience this page
  // exists to avoid — so it's deliberately excluded here.
  const PAYMENT_METHODS = ['telebirr', 'cbebirr', 'ebirr', 'mpesa'];

  let paymentId = '';
  let amount = 0;
  let txRef = '';
  let fallbackUrl = '';
  let invalid = false;
  let scriptError = false;
  let ready = false;
  let resolved = false;
  let cancelling = false;
  let renderObserver: MutationObserver | undefined;
  let renderTimeout: ReturnType<typeof setTimeout> | undefined;

  function loadChapaScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.ChapaCheckout) {
        resolve();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHAPA_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('load-failed')));
        return;
      }
      const script = document.createElement('script');
      script.src = CHAPA_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('load-failed'));
      document.head.appendChild(script);
    });
  }

  function openFallback() {
    if (fallbackUrl) window.location.href = fallbackUrl;
  }

  async function cancel() {
    if (cancelling) return;
    cancelling = true;
    resolved = true;
    if (paymentId) {
      await cancelPaymentAndReturnHome(paymentId);
    } else {
      await goto('/raffles');
    }
  }

  onMount(async () => {
    // The widget renders its own form and manages its own scroll/touch —
    // a pull-to-refresh gesture over it would just fight that.
    pullRefresh.set(null);

    const params = $page.url.searchParams;
    paymentId = params.get('paymentId') ?? '';
    amount = Number(params.get('amount') ?? '0');
    txRef = params.get('txRef') ?? '';
    fallbackUrl = params.get('checkoutUrl') ?? '';
    invalid = !paymentId || !txRef || !(amount > 0);
    if (invalid) return;

    try {
      await loadChapaScript();
    } catch {
      scriptError = true;
      return;
    }
    if (!window.ChapaCheckout) {
      scriptError = true;
      return;
    }

    const publicKey = import.meta.env.VITE_CHAPA_PUBLIC_KEY as string | undefined;
    if (!publicKey) {
      scriptError = true;
      return;
    }

    const chapa = new window.ChapaCheckout({
      publicKey,
      amount: String(amount),
      currency: 'ETB',
      tx_ref: txRef,
      availablePaymentMethods: PAYMENT_METHODS,
      customizations: {
        buttonText: 'Pay now',
        styles: `.chapa-pay-button { background-color: #00D3A0; color: #ffffff; }`,
      },
      onSuccessfulPayment: (_result, refId) => {
        if (refId && refId !== txRef) {
          // The widget settled on a different reference than the one this
          // payment was reserved under — our webhook keys off OUR tx_ref,
          // so this specific charge could otherwise strand itself as
          // 'pending' forever. Surfaced loudly rather than silently
          // trusted, since /payments/:id's own polling+verify (not this
          // callback) is what actually confirms and issues tickets.
          console.error('Chapa inline tx_ref mismatch', { expected: txRef, actual: refId });
        }
        resolved = true;
        goto(`/payments/${paymentId}`, { replaceState: true });
      },
      onPaymentFailure: () => {
        cancel();
      },
      onClose: () => {
        cancel();
      },
    });
    chapa.initialize(CONTAINER_ID);

    // Confirm the widget actually painted something — a script that loads
    // fine but fails silently inside (bad public key, Chapa API outage,
    // an unsupported browser feature) looks identical to "still loading"
    // otherwise, forever.
    const container = document.getElementById(CONTAINER_ID);
    if (container) {
      renderObserver = new MutationObserver(() => {
        if (container.childElementCount > 0) {
          ready = true;
          renderObserver?.disconnect();
          clearTimeout(renderTimeout);
        }
      });
      renderObserver.observe(container, { childList: true });
    }
    renderTimeout = setTimeout(() => {
      if (!ready) {
        scriptError = true;
        renderObserver?.disconnect();
      }
    }, RENDER_TIMEOUT_MS);
  });

  onDestroy(() => {
    renderObserver?.disconnect();
    clearTimeout(renderTimeout);
    // Covers leaving any other way (hardware/gesture back) — fire-and-
    // forget, no redirect here since some other navigation is already in
    // flight; this only makes sure the payment doesn't linger as
    // 'pending'. cancel() above already handles its own case and sets
    // `resolved` first, so this never double-fires for that path.
    if (!resolved && !invalid && paymentId) {
      api.post(`/payments/${paymentId}/cancel`).catch(() => undefined);
    }
  });
</script>

<svelte:head><title>Secure checkout · YeneEta</title></svelte:head>

<div class="checkout-page flex flex-col" transition:fly={{ y: 10, duration: 220, easing: cubicOut }}>
  <header class="flex h-11 shrink-0 items-center justify-between">
    <button
      type="button"
      class="pressable flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink disabled:opacity-50"
      aria-label="Back"
      disabled={cancelling}
      on:click={cancel}
    >
      <ArrowLeft size={20} />
    </button>
    <p class="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
      <ShieldCheck size={13} class="text-primary-dark" /> Secure checkout
    </p>
    <span class="h-11 w-11"></span>
  </header>

  {#if invalid}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-[20px] bg-pink-bg text-pink"><AlertCircle size={24} /></span>
      <p class="text-sm font-bold text-ink">This checkout link isn't valid.</p>
      <p class="max-w-[260px] text-xs leading-5 text-muted">Go back and try buying your tickets again.</p>
      <button type="button" class="pressable mt-2 h-11 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={cancel}>Back to tickets</button>
    </div>
  {:else if scriptError}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-[20px] bg-pink-bg text-pink"><AlertCircle size={24} /></span>
      <p class="text-sm font-bold text-ink">Couldn't load the secure checkout form.</p>
      <p class="max-w-[280px] text-xs leading-5 text-muted">Check your connection, or use the full checkout page instead.</p>
      {#if fallbackUrl}
        <button type="button" class="pressable mt-2 flex h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={openFallback}>
          Open full checkout <ExternalLink size={15} />
        </button>
      {/if}
    </div>
  {:else}
    <div class="mt-3 flex flex-1 flex-col overflow-hidden rounded-card bg-card px-4 pb-4 pt-5 shadow-card">
      <div class="flex items-center justify-between border-b border-dot-inactive/50 pb-4">
        <div class="flex items-center gap-2.5">
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-action-bg text-primary-dark"><Smartphone size={16} /></span>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Amount due</p>
            <p class="text-lg font-extrabold text-ink">{formatEtb(amount)} <span class="text-xs font-bold text-muted">ETB</span></p>
          </div>
        </div>
        <span class="flex items-center gap-1 text-[10px] font-bold text-muted"><ShieldCheck size={12} class="text-primary-dark" /> Encrypted</span>
      </div>

      <div id={CONTAINER_ID} class="chapa-inline-container flex-1 pt-4" aria-busy={!ready} aria-label="Payment form">
        {#if !ready}
          <div class="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <div class="h-6 w-6 animate-spin rounded-full border-2 border-dot-inactive border-t-primary-dark"></div>
            <p class="text-xs font-semibold">Preparing secure payment…</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .checkout-page {
    height: calc(100dvh - max(44px, var(--safe-top)) - 190px);
    min-height: 0;
  }
  .chapa-inline-container {
    overflow-y: auto;
  }
</style>
