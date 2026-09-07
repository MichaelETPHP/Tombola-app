<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ArrowRight, ShieldCheck } from 'lucide-svelte';

  let paymentId = '';
  let invalid = false;

  function continueToReceipt() {
    if (paymentId) goto(`/payments/${paymentId}`, { replaceState: true });
  }

  onMount(() => {
    paymentId = $page.url.searchParams.get('payment_id') ?? '';
    const target = $page.url.searchParams.get('target');
    invalid = !/^[0-9a-f-]{36}$/i.test(paymentId);
    if (invalid) return;

    if (target === 'native') {
      // Android hands this URL back to the installed app. If the app cannot
      // be opened, the HTTPS receipt remains as a usable fallback.
      window.location.href = `yeneeta://payment-return?payment_id=${encodeURIComponent(paymentId)}`;
      setTimeout(continueToReceipt, 1200);
    } else {
      continueToReceipt();
    }
  });
</script>

<svelte:head><title>Returning to YeneEta</title></svelte:head>

<main class="safe-area-top flex min-h-dvh items-center justify-center bg-bg-start px-5 text-ink">
  <section class="w-full max-w-sm rounded-card bg-card p-6 text-center shadow-card">
    <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-action-bg text-primary-dark">
      <ShieldCheck size={25} />
    </span>
    <h1 class="mt-4 text-xl font-extrabold tracking-[-0.025em]">{invalid ? 'Invalid payment return' : 'Returning to YeneEta'}</h1>
    <p class="mt-2 text-sm leading-6 text-muted">
      {invalid ? 'This payment link is incomplete.' : 'Your payment is being securely verified. Tickets are issued only after confirmation.'}
    </p>
    {#if !invalid}
      <button type="button" class="pressable mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-button bg-primary text-sm font-extrabold text-white" on:click={continueToReceipt}>
        View payment status <ArrowRight size={17} />
      </button>
    {/if}
  </section>
</main>
