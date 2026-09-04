<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { updatePayoutStatusSchema, type Payout } from '$lib/schemas/index.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import { ArrowLeft, Check, Copy, PackageCheck, ShieldAlert, Trophy, User, X } from 'lucide-svelte';

  let payout: Payout | null = null;
  let loading = true;
  let updating = false;
  let notFound = false;

  async function load() {
    loading = true;
    notFound = false;
    try {
      const res = await api.get<{ payout: Payout }>(`/admin/payouts/${$page.params.id}`);
      payout = res.payout;
    } catch (err) {
      notFound = err instanceof ApiError && err.status === 404;
      console.error('Failed to load payout', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function updateStatus(status: 'verified' | 'fulfilled' | 'rejected') {
    if (!payout) return;
    updating = true;
    try {
      const data = updatePayoutStatusSchema.parse({ status });
      const res = await api.patch<{ payout: Payout }>(`/admin/payouts/${payout.id}`, data);
      payout = res.payout;
      toast.success(`Payout marked ${status}.`, 'Updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? 'Could not update payout.' : 'Network error.', 'Update Failed');
    } finally {
      updating = false;
    }
  }

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`, 'Copied');
  }

  $: deadlinePassed = payout ? new Date(payout.claimDeadline) < new Date() : false;

  const formatEtb = (n: number) => Number(n).toLocaleString();
</script>

<svelte:head><title>Payout review | YeneEta Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <div class="flex items-center gap-3">
    <a href="/payouts" class="admin-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink no-underline shadow-card-light" aria-label="Back to payouts">
      <ArrowLeft size={18} />
    </a>
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">Prize fulfillment</p>
      <h1 class="text-xl font-bold tracking-[-0.02em] text-ink">Payout review</h1>
    </div>
  </div>

  {#if loading}
    <div class="h-[380px] animate-pulse rounded-card bg-border"></div>
  {:else if notFound || !payout}
    <div class="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-card border border-border bg-card p-8 text-center">
      <ShieldAlert size={22} class="text-danger" />
      <p class="text-sm font-bold text-ink">Payout not found</p>
    </div>
  {:else}
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-5">
        <section class="rounded-card border border-border bg-card p-5 sm:p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-bg text-primary-dark"><User size={19} /></span>
              <div>
                <p class="text-base font-bold text-ink">{payout.winnerFullName || 'Unnamed winner'}</p>
                <button type="button" class="admin-press mt-0.5 flex items-center gap-1 font-mono text-xs text-faint hover:text-ink" on:click={() => copy(payout?.winnerPhone ?? '', 'Phone')}>
                  {payout.winnerPhone ?? '—'} <Copy size={10} />
                </button>
              </div>
            </div>
            <StatusBadge status={payout.status} />
          </div>

          <div class="mt-5 flex items-center gap-3 rounded-button bg-bg/60 p-3.5">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-bg text-gold"><Trophy size={16} /></span>
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-ink">{payout.raffleTitle ?? 'Raffle'} <span class="font-normal text-faint">· {payout.raffleCode ?? ''}</span></p>
              <p class="mt-0.5 truncate text-xs text-muted">{payout.prizeName ?? 'Prize'}{payout.prizeTier ? ` · Tier ${payout.prizeTier}` : ''}</p>
            </div>
          </div>

          <dl class="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Gross value</dt><dd class="mt-1 font-mono font-bold text-ink">{formatEtb(payout.grossPrizeValue)} ETB</dd></div>
            <div><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Tax withheld</dt><dd class="mt-1 font-mono font-bold text-ink">{formatEtb(payout.taxWithheld)} ETB</dd></div>
            <div><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Net value</dt><dd class="mt-1 font-mono font-bold text-primary-dark">{formatEtb(payout.netValue)} ETB</dd></div>
            <div class="col-span-2 sm:col-span-1"><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Claim deadline</dt><dd class="mt-1 font-semibold {deadlinePassed ? 'text-danger' : 'text-ink'}">{toEthiopianDateTime(payout.claimDeadline)}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Delivery method</dt><dd class="mt-1 font-semibold capitalize text-ink">{payout.deliveryMethod ?? '—'}</dd></div>
            <div><dt class="text-[11px] font-bold uppercase tracking-wide text-faint">Fulfillment</dt><dd class="mt-1 font-semibold capitalize text-ink">{payout.fulfillmentStatus}</dd></div>
          </dl>

          {#if payout.deliveryAddress}
            <div class="mt-4 rounded-button bg-bg/60 p-3.5">
              <p class="text-[11px] font-bold uppercase tracking-wide text-faint">Delivery address</p>
              <p class="mt-1 text-sm text-ink">{payout.deliveryAddress}</p>
            </div>
          {/if}

          <div class="mt-5">
            {#if payout.idDocumentUrl}
              <a class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border bg-bg px-4 text-xs font-bold text-ink no-underline" href={payout.idDocumentUrl} target="_blank" rel="noreferrer">
                View submitted ID document ↗
              </a>
            {:else}
              <p class="text-[13px] text-faint">No ID document submitted yet.</p>
            {/if}
          </div>
        </section>
      </div>

      <aside class="flex flex-col gap-5">
        <section class="rounded-card border border-border bg-card p-5">
          <h2 class="mb-1 text-sm font-bold text-ink">Review actions</h2>
          <p class="mb-4 text-xs text-muted">Each step only unlocks once the previous one is done.</p>

          <div class="flex flex-col gap-2">
            <button type="button"
              class="admin-press flex h-11 items-center justify-center gap-2 rounded-button bg-primary-bg text-[13px] font-bold text-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
              disabled={updating || payout.status !== 'id_submitted'}
              on:click={() => updateStatus('verified')}>
              <Check size={14} /> Verify identity
            </button>
            <button type="button"
              class="admin-press flex h-11 items-center justify-center gap-2 rounded-button bg-success-bg text-[13px] font-bold text-success disabled:cursor-not-allowed disabled:opacity-40"
              disabled={updating || payout.status !== 'verified'}
              on:click={() => updateStatus('fulfilled')}>
              <PackageCheck size={14} /> Mark fulfilled
            </button>
            <button type="button"
              class="admin-press flex h-11 items-center justify-center gap-2 rounded-button bg-danger-bg text-[13px] font-bold text-danger disabled:cursor-not-allowed disabled:opacity-40"
              disabled={updating || !['id_submitted', 'verified'].includes(payout.status)}
              on:click={() => updateStatus('rejected')}>
              <X size={14} /> Reject claim
            </button>
          </div>
        </section>

        <section class="rounded-card border border-border bg-sidebar p-5 text-white">
          <p class="text-xs leading-relaxed text-white/70">Status changes here are recorded to the audit trail with the acting admin and timestamp.</p>
        </section>
      </aside>
    </div>
  {/if}
</div>
