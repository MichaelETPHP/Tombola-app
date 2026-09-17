<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { api, ApiError } from '$lib/api/client.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { captureIdDocument } from '$lib/native/capabilities.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { payouts as payoutsStore } from '$lib/stores/wins.store.js';
  import { ArrowLeft, Camera, Check, CheckCircle2, RefreshCw, ShieldAlert, Trophy } from 'lucide-svelte';

  interface DeliveryMethod {
    id: string;
    label: string;
    requiresDetails: boolean;
    detailsLabel: string | null;
  }

  interface PayoutDetail {
    id: string;
    status: string;
    raffleTitle: string;
    prizeName: string | null;
    prizeTier: number | null;
    netValue: number;
    claimDeadline: string;
    idDocumentUrl: string | null;
  }

  const payoutId = $page.params.id;

  let loading = true;
  let loadError = false;
  let notFound = false;
  let payout: PayoutDetail | null = null;
  let methods: DeliveryMethod[] = [];

  let idDocumentUrl: string | null = null;
  let capturingId = false;
  let uploadingId = false;

  let selectedMethodId = '';
  let details = '';
  let submitting = false;
  let submitError = '';
  let submitted = false;

  $: selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null;
  $: deadlinePassed = payout ? new Date(payout.claimDeadline) < new Date() : false;
  $: detailsOk = !selectedMethod?.requiresDetails || details.trim().length > 0;
  $: canSubmit = !!idDocumentUrl && !!selectedMethodId && detailsOk && !submitting;
  $: prizeLine = payout
    ? payout.prizeTier
      ? $_('claim.prizeLabelWithTier', { values: { tier: payout.prizeTier } })
      : $_('claim.prizeLabel')
    : '';

  async function load() {
    loading = true;
    loadError = false;
    notFound = false;
    try {
      const [payoutRes, methodsRes] = await Promise.all([
        api.get<{ payout: PayoutDetail }>(`/payouts/${payoutId}`),
        api.get<{ methods: DeliveryMethod[] }>('/payouts/delivery-methods'),
      ]);
      payout = payoutRes.payout;
      methods = methodsRes.methods;
      idDocumentUrl = payout.idDocumentUrl;
      if (!selectedMethodId && methods.length === 1) selectedMethodId = methods[0].id;
    } catch (err) {
      notFound = err instanceof ApiError && err.status === 404;
      loadError = !notFound;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function takeIdPhoto() {
    if (capturingId || uploadingId) return;
    capturingId = true;
    submitError = '';
    try {
      const photo = await captureIdDocument();
      if (!photo.webPath) throw new Error('No photo captured');
      const response = await fetch(photo.webPath);
      const blob = await response.blob();

      capturingId = false;
      uploadingId = true;
      const formData = new FormData();
      formData.append('image', blob, 'id-document.jpg');
      const result = await api.upload<{ idDocumentUrl: string }>(`/payouts/${payoutId}/id-document`, formData);
      idDocumentUrl = result.idDocumentUrl;
      await hapticLight();
    } catch (err) {
      submitError = err instanceof ApiError ? err.message : $_('claim.cameraError');
    } finally {
      capturingId = false;
      uploadingId = false;
    }
  }

  async function submit() {
    if (!canSubmit || !selectedMethod) return;
    submitting = true;
    submitError = '';
    try {
      await api.post(`/payouts/${payoutId}/claim`, {
        deliveryMethodId: selectedMethod.id,
        deliveryAddress: selectedMethod.requiresDetails ? details.trim() : undefined,
      });
      await hapticMedium();
      submitted = true;
      payoutsStore.set([]); // stale — Wins re-fetches fresh next time it mounts
    } catch (err) {
      submitError = err instanceof ApiError ? err.message : $_('claim.submitError');
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>{$_('claim.pageTitle')}</title></svelte:head>

<section class="claim-page flex min-h-0 flex-col gap-5">
  <header class="flex h-12 shrink-0 items-center">
    <button type="button" class="pressable flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink" aria-label={$_('claim.backAria')} on:click={() => { hapticLight(); navigateBack(); }}>
      <ArrowLeft size={20} />
    </button>
    <h1 class="flex-1 text-center text-base font-extrabold text-ink">{$_('claim.pageTitle')}</h1>
    <span class="h-11 w-11" aria-hidden="true"></span>
  </header>

  {#if loading}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-muted" aria-live="polite">
      <div class="h-7 w-7 animate-spin rounded-full border-[3px] border-dot-inactive border-t-primary-dark"></div>
      <p class="text-sm font-semibold">{$_('claim.loadingAria')}</p>
    </div>
  {:else if notFound}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <ShieldAlert size={30} class="text-pink" />
      <h2 class="mt-4 text-lg font-extrabold text-ink">{$_('claim.notFoundTitle')}</h2>
      <p class="mt-2 max-w-[280px] text-sm leading-6 text-muted">{$_('claim.notFoundBody')}</p>
      <a href="/wins" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white no-underline">{$_('claim.backToWins')}</a>
    </div>
  {:else if loadError}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <ShieldAlert size={30} class="text-pink" />
      <p class="mt-3 text-sm font-semibold text-ink">{$_('claim.loadErrorBody')}</p>
      <button type="button" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white" on:click={load}>
        <RefreshCw size={16} /> {$_('claim.retry')}
      </button>
    </div>
  {:else if submitted}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span class="flex h-16 w-16 items-center justify-center rounded-full bg-online/15 text-online"><CheckCircle2 size={30} /></span>
      <h2 class="mt-4 text-lg font-extrabold text-ink">{$_('claim.submitSuccessTitle')}</h2>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('claim.submitSuccessBody')}</p>
      <a href="/wins" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white no-underline">{$_('claim.backToWins')}</a>
    </div>
  {:else if payout && payout.status !== 'pending_claim'}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <ShieldAlert size={30} class="text-gold" />
      <h2 class="mt-4 text-lg font-extrabold text-ink">{$_('claim.alreadySubmittedTitle')}</h2>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('claim.alreadySubmittedBody')}</p>
      <a href="/wins" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white no-underline">{$_('claim.backToWins')}</a>
    </div>
  {:else if payout && deadlinePassed}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <ShieldAlert size={30} class="text-pink" />
      <h2 class="mt-4 text-lg font-extrabold text-ink">{$_('claim.deadlinePassedTitle')}</h2>
      <p class="mt-2 max-w-[300px] text-sm leading-6 text-muted">{$_('claim.deadlinePassedBody')}</p>
      <a href="/wins" class="pressable mt-5 flex min-h-11 items-center gap-2 rounded-button bg-ink px-5 text-sm font-bold text-white no-underline">{$_('claim.backToWins')}</a>
    </div>
  {:else if payout}
    <div class="flex flex-1 flex-col gap-5 overflow-y-auto pb-6">
      <div class="flex items-center gap-3 rounded-card bg-card p-4 shadow-card">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-bg text-gold"><Trophy size={20} /></span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-ink">{payout.raffleTitle}</p>
          <p class="mt-0.5 truncate text-xs text-muted">{prizeLine}{payout.prizeName ? ` · ${payout.prizeName}` : ''}</p>
        </div>
        <p class="shrink-0 text-sm font-extrabold text-primary-dark">{formatEtb(payout.netValue)} ETB</p>
      </div>

      <section class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <div>
          <h2 class="text-sm font-extrabold text-ink">{$_('claim.idSectionTitle')}</h2>
          <p class="mt-1 text-xs leading-relaxed text-muted">{$_('claim.idSectionBody')}</p>
        </div>
        <button
          type="button"
          disabled={capturingId || uploadingId}
          class="pressable flex h-12 items-center justify-center gap-2 rounded-button text-sm font-bold disabled:opacity-60 {idDocumentUrl ? 'bg-online/15 text-online' : 'bg-primary text-white'}"
          on:click={takeIdPhoto}
        >
          {#if uploadingId}
            {$_('claim.uploading')}
          {:else if idDocumentUrl}
            <Check size={17} /> {$_('claim.idUploaded')}
          {:else}
            <Camera size={17} /> {$_('claim.takePhoto')}
          {/if}
        </button>
        {#if idDocumentUrl && !uploadingId}
          <button type="button" class="tappable self-start text-xs font-bold text-primary-dark underline underline-offset-2" on:click={takeIdPhoto}>
            {$_('claim.retakePhoto')}
          </button>
        {/if}
      </section>

      <section class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <h2 class="text-sm font-extrabold text-ink">{$_('claim.deliverySectionTitle')}</h2>
        <div class="flex flex-col gap-2">
          {#each methods as method (method.id)}
            <button
              type="button"
              class="tappable flex items-center gap-3 rounded-button border p-3 text-left {selectedMethodId === method.id ? 'border-primary bg-action-bg' : 'border-dot-inactive'}"
              on:click={() => { hapticLight(); selectedMethodId = method.id; }}
            >
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {selectedMethodId === method.id ? 'border-primary bg-primary' : 'border-dot-inactive'}">
                {#if selectedMethodId === method.id}<Check size={12} class="text-white" strokeWidth={3} />{/if}
              </span>
              <span class="text-sm font-semibold text-ink">{method.label}</span>
            </button>
          {/each}
        </div>
        {#if selectedMethod?.requiresDetails}
          <label class="flex flex-col gap-1.5 text-xs font-bold text-muted" for="claim-details">
            {selectedMethod.detailsLabel || $_('claim.detailsPlaceholder')}
            <textarea
              id="claim-details"
              bind:value={details}
              rows="2"
              maxlength="500"
              placeholder={selectedMethod.detailsLabel || $_('claim.detailsPlaceholder')}
              class="rounded-button border border-dot-inactive bg-card p-3 text-sm font-normal text-ink focus:border-primary focus:outline-none"
            ></textarea>
          </label>
        {/if}
      </section>

      {#if submitError}<p class="text-center text-xs font-semibold text-pink" role="alert">{submitError}</p>{/if}

      <button
        type="button"
        disabled={!canSubmit}
        class="pressable flex h-14 items-center justify-center gap-2 rounded-button bg-primary text-sm font-extrabold text-white disabled:opacity-50"
        on:click={submit}
      >
        {submitting ? $_('claim.submitting') : $_('claim.submitButton')}
      </button>
    </div>
  {/if}
</section>

<style>
  .claim-page {
    animation: claim-arrive 300ms var(--ease-out) both;
  }

  @keyframes claim-arrive {
    from { opacity: 0.7; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .claim-page { animation: none; }
  }
</style>
