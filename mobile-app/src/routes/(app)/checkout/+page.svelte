<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api } from '$lib/api/client.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { ArrowLeft, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-svelte';

  const pullRefresh = getPullRefreshContext();

  // Only Chapa's own checkout domain is ever framed here. The URL arrives
  // as a query param this page doesn't control the provenance of — a
  // crafted link pointing anywhere else would dress up an arbitrary page
  // in this app's own trusted chrome, so an unrecognized origin is
  // rejected outright rather than framed.
  const ALLOWED_HOST_SUFFIX = '.chapa.co';

  const POLL_INTERVAL_MS = 2000;
  const POLL_TIMEOUT_MS = 10 * 60_000;

  let paymentId = '';
  let checkoutUrl = '';
  let invalid = false;
  let resolved = false;
  let cancelling = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  // Chapa's return_url lands *inside the iframe*, not on this outer page —
  // an in-frame goto() there would just re-render a nested copy of this
  // whole app inside itself. Polling from out here instead sidesteps that
  // entirely: whatever the iframe ends up showing, this page notices the
  // payment settled and navigates itself, independent of what's inside.
  async function pollStatus() {
    if (!paymentId) return;
    try {
      const res = await api.get<{ payment: { status: string } }>(`/payments/${paymentId}`);
      if (res.payment.status !== 'pending') {
        resolved = true;
        stopPolling();
        await goto(`/payments/${paymentId}`, { replaceState: true });
      }
    } catch {
      // A missed poll just gets picked up on the next tick.
    }
  }

  function stopPolling() {
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
  }

  function openFullScreen() {
    window.location.href = checkoutUrl;
  }

  async function cancel() {
    if (cancelling) return;
    if (!paymentId) {
      await goto('/raffles');
      return;
    }
    cancelling = true;
    resolved = true;
    stopPolling();
    // Handles the race itself — lands on the real receipt instead of a
    // "cancelled" toast if the payment actually went through right as the
    // user tapped back.
    await cancelPaymentAndReturnHome(paymentId);
  }

  onMount(() => {
    // Already polls on its own; a pull gesture over the iframe would also
    // fight its internal scrolling.
    pullRefresh.set(null);

    paymentId = $page.url.searchParams.get('paymentId') ?? '';
    const rawUrl = $page.url.searchParams.get('url') ?? '';
    try {
      const parsed = new URL(rawUrl);
      const hostOk = parsed.hostname === 'chapa.co' || parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX);
      invalid = parsed.protocol !== 'https:' || !hostOk || !paymentId;
      checkoutUrl = parsed.toString();
    } catch {
      invalid = true;
    }

    if (!invalid) {
      pollTimer = setInterval(pollStatus, POLL_INTERVAL_MS);
      // A hard ceiling only — the payment itself still resolves via the
      // stale-payment sweep server-side either way; this just stops an
      // abandoned tab from polling forever.
      timeoutTimer = setTimeout(stopPolling, POLL_TIMEOUT_MS);
    }
  });
  onDestroy(() => {
    stopPolling();
    // Covers leaving any other way (hardware/gesture back, switching
    // tabs) — fire-and-forget, no redirect here since some other
    // navigation is already in flight; this only makes sure the payment
    // doesn't linger as 'pending'. The explicit cancel() above already
    // handles its own case via cancelPaymentAndReturnHome and sets
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
  {:else}
    <div class="mt-3 flex flex-1 flex-col overflow-hidden rounded-card bg-card shadow-card">
      <iframe src={checkoutUrl} title="Chapa secure checkout" class="min-h-0 w-full flex-1 border-0" allow="payment"></iframe>
      <button type="button" class="trouble-link flex h-10 shrink-0 items-center justify-center gap-1.5 border-t border-dot-inactive/60 text-[11px] font-semibold text-muted" on:click={openFullScreen}>
        Payment page not loading? <span class="font-bold text-primary-dark underline">Open full screen</span>
        <ExternalLink size={11} />
      </button>
    </div>
  {/if}
</div>

<style>
  .checkout-page {
    height: calc(100dvh - max(44px, var(--safe-top)) - 190px);
    min-height: 0;
  }
</style>
