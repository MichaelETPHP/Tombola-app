<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-svelte';

  interface PaymentReview {
    id: string;
    raffleId: string;
    raffleTitle: string;
    userId: string;
    userPhone: string;
    userFullName: string | null;
    amount: number;
    ticketCount: number;
    selectedNumbers: number[] | null;
    status: string;
    gateway: string;
    gatewayRef: string | null;
    createdAt: string;
  }

  let items: PaymentReview[] = [];
  let loading = true;
  let loadError = false;
  let resolving: PaymentReview | null = null;
  let reference = '';
  let submitting = false;

  const formatEtb = (n: number) => Number(n).toLocaleString();

  const columns = [
    { key: 'customer', label: 'Customer' },
    { key: 'raffle', label: 'Raffle' },
    { key: 'amount', label: 'Charged' },
    { key: 'numbers', label: 'Numbers requested' },
    { key: 'createdAt', label: 'Charged at', sortable: true },
    { key: 'actions', label: '' },
  ];

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return 'Network error.';
    try {
      const body = JSON.parse(err.body) as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  }

  async function load() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ payments: PaymentReview[] }>('/admin/payments/review-queue?limit=100');
      items = res.payments;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  function openResolve(item: PaymentReview) {
    resolving = item;
    reference = '';
  }

  async function confirmResolve() {
    if (!resolving || submitting) return;
    submitting = true;
    try {
      await api.post(`/admin/payments/${resolving.id}/resolve-review`, { reference: reference.trim() || undefined });
      toast.success('Marked resolved and refunded.', 'Payment Review');
      resolving = null;
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not resolve this payment.'), 'Resolve Failed');
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>Payment reviews · 251 Lottery Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <header class="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-danger"><AlertTriangle size={14} /> Needs attention</div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Payment reviews</h1>
      <p class="mt-2 max-w-[620px] text-sm leading-relaxed text-muted">
        Chapa confirmed these charges as paid, but the ticket numbers the customer had selected were no longer
        available by the time that confirmation arrived — usually because the reservation expired, or the customer
        cancelled the USSD prompt and the numbers were released to someone else before a late confirmation came
        through. The customer was charged and got nothing; each one needs a refund (outside this system, via Chapa's
        dashboard) before you mark it resolved here.
      </p>
    </div>
    <button type="button" class="admin-press flex h-10 shrink-0 items-center justify-center gap-2 rounded-button border border-border bg-card px-4 text-xs font-bold text-ink" on:click={load}>
      <RefreshCw size={15} /> Refresh
    </button>
  </header>

  {#if loading}
    <div class="h-[300px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <section class="flex min-h-[200px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <p class="text-sm font-bold text-ink">Could not load the review queue.</p>
      <button type="button" class="admin-press mt-4 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={load}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else if items.length === 0}
    <section class="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-card px-6 text-center">
      <Check size={22} class="text-success" />
      <p class="text-sm font-bold text-ink">Nothing needs review right now.</p>
      <p class="max-w-sm text-xs text-muted">Every verified charge issued its tickets cleanly.</p>
    </section>
  {:else}
    <DataTable {columns} rows={items} emptyMessage="Nothing needs review right now.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'customer'}
          <a href="/users/{row.userId}" class="font-bold text-ink underline-offset-2 hover:underline">{row.userFullName || row.userPhone}</a>
          <p class="mt-0.5 font-mono text-[11px] text-faint">{row.userPhone}</p>
        {:else if column === 'raffle'}
          <span class="text-ink">{row.raffleTitle}</span>
        {:else if column === 'amount'}
          <span class="font-mono font-bold text-danger">{formatEtb(row.amount)} ETB</span>
          <p class="mt-0.5 text-[10px] text-faint">{row.gateway}{row.gatewayRef ? ` · ${row.gatewayRef}` : ''}</p>
        {:else if column === 'numbers'}
          <span class="font-mono text-xs text-muted">{row.selectedNumbers?.length ? row.selectedNumbers.join(', ') : `${row.ticketCount} ticket${row.ticketCount === 1 ? '' : 's'}`}</span>
        {:else if column === 'createdAt'}
          <span class="whitespace-nowrap text-muted">{toEthiopianDateTime(row.createdAt)}</span>
        {:else if column === 'actions'}
          <button type="button" class="admin-press flex h-9 items-center gap-2 rounded-button bg-danger-bg px-3 text-xs font-bold text-danger" on:click={() => openResolve(row)}>
            <Check size={14} /> Mark refunded
          </button>
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>

{#if resolving}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[420px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">Confirm this charge was refunded</h2>
      <p class="mt-1.5 text-sm text-muted">
        {resolving.userFullName || resolving.userPhone} was charged {formatEtb(resolving.amount)} ETB for
        {resolving.raffleTitle}. Only continue once you've actually refunded them through Chapa.
      </p>
      <label class="mt-4 flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint" for="review-reference">
        Refund reference (optional)
        <input
          id="review-reference"
          bind:value={reference}
          maxlength="200"
          placeholder="e.g. Chapa refund ID"
          class="h-11 rounded-button border border-border bg-bg px-3 text-sm font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none"
        />
      </label>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={submitting} on:click={() => (resolving = null)}>Cancel</button>
        <button type="button" class="admin-press flex h-10 items-center justify-center gap-1.5 rounded-button bg-danger px-5 text-xs font-bold text-white disabled:opacity-50" disabled={submitting} on:click={confirmResolve}>
          {#if submitting}<Loader2 size={14} class="animate-spin" />{/if} {submitting ? 'Resolving…' : 'Confirm refunded'}
        </button>
      </div>
    </div>
  </div>
{/if}
