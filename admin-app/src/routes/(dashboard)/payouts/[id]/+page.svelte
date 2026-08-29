<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { updatePayoutStatusSchema, type Payout } from '$lib/schemas/index.js';

  // There's no GET /admin/payouts/:id yet — only the list and PATCH
  // endpoints exist. We fetch the unfiltered list and find this row in it,
  // which is fine at admin-dashboard scale. Add a single-record endpoint
  // to the API if the payouts volume ever makes that too slow.
  let payout: Payout | null = null;
  let loading = true;
  let updating = false;
  let error = '';

  async function load() {
    loading = true;
    try {
      const res = await api.get<{ payouts: Payout[] }>('/admin/payouts?limit=500');
      payout = res.payouts.find((p) => p.id === $page.params.id) ?? null;
    } catch (err) {
      console.error('Failed to load payout', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function updateStatus(status: 'verified' | 'fulfilled' | 'rejected') {
    if (!payout) return;
    error = '';
    updating = true;
    try {
      const data = updatePayoutStatusSchema.parse({ status });
      const res = await api.patch<{ payout: Payout }>(`/admin/payouts/${payout.id}`, data);
      payout = res.payout;
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update payout.' : 'Network error.';
    } finally {
      updating = false;
    }
  }

  $: deadlinePassed = payout ? new Date(payout.claimDeadline) < new Date() : false;
</script>

{#if loading}
  <p class="text-[13px] text-muted">Loading…</p>
{:else if !payout}
  <p class="text-[13px] text-muted">Payout not found.</p>
{:else}
  <div class="mb-6 flex items-center gap-3">
    <h1 class="text-[22px] font-bold text-ink">Payout {payout.id.slice(0, 8)}…</h1>
    <StatusBadge status={payout.status} />
  </div>

  <div class="grid grid-cols-2 gap-5">
    <div class="rounded-card border border-border bg-card p-5">
      <h2 class="mb-4 text-[15px] font-bold text-ink">Claim details</h2>
      <dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted">Raffle</dt>
        <dd class="break-all font-semibold text-ink">{payout.raffleId}</dd>
        <dt class="text-muted">Winner</dt>
        <dd class="break-all font-semibold text-ink">{payout.winnerUserId}</dd>
        <dt class="text-muted">Claim deadline</dt>
        <dd class="font-semibold {deadlinePassed ? 'text-danger' : 'text-ink'}">
          {new Date(payout.claimDeadline).toLocaleString()}
        </dd>
        <dt class="text-muted">Gross prize value</dt>
        <dd class="font-semibold text-ink">{payout.grossPrizeValue} ETB</dd>
        <dt class="text-muted">Tax withheld</dt>
        <dd class="font-semibold text-ink">{payout.taxWithheld} ETB</dd>
        <dt class="text-muted">Net value</dt>
        <dd class="font-semibold text-ink">{payout.netValue} ETB</dd>
        <dt class="text-muted">Delivery method</dt>
        <dd class="font-semibold text-ink">{payout.deliveryMethod ?? '—'}</dd>
        <dt class="text-muted">Delivery address</dt>
        <dd class="font-semibold text-ink">{payout.deliveryAddress ?? '—'}</dd>
        <dt class="text-muted">Fulfillment</dt>
        <dd class="font-semibold text-ink">{payout.fulfillmentStatus}</dd>
      </dl>

      {#if payout.idDocumentUrl}
        <a class="text-[13px] font-semibold text-primary" href={payout.idDocumentUrl} target="_blank" rel="noreferrer">
          View submitted ID document ↗
        </a>
      {:else}
        <p class="text-[13px] text-muted">No ID document submitted yet.</p>
      {/if}
    </div>

    <div class="rounded-card border border-border bg-card p-5">
      <h2 class="mb-4 text-[15px] font-bold text-ink">Review</h2>

      {#if error}
        <p class="mb-3 text-[13px] text-danger">{error}</p>
      {/if}

      <div class="flex gap-2">
        <button
          class="flex-1 rounded-button bg-primary-bg px-3 py-2 text-[13px] font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={updating || payout.status !== 'id_submitted'}
          on:click={() => updateStatus('verified')}
        >
          Verify
        </button>
        <button
          class="flex-1 rounded-button bg-success-bg px-3 py-2 text-[13px] font-semibold text-success disabled:cursor-not-allowed disabled:opacity-50"
          disabled={updating || payout.status !== 'verified'}
          on:click={() => updateStatus('fulfilled')}
        >
          Mark fulfilled
        </button>
        <button
          class="flex-1 rounded-button bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"
          disabled={updating || !['id_submitted', 'verified'].includes(payout.status)}
          on:click={() => updateStatus('rejected')}
        >
          Reject
        </button>
      </div>
    </div>
  </div>
{/if}
