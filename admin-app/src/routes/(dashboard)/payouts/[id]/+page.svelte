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
  let notes = '';
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
      const data = updatePayoutStatusSchema.parse({ status, notes: notes || undefined });
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
  <p class="hint">Loading…</p>
{:else if !payout}
  <p class="hint">Payout not found.</p>
{:else}
  <div class="header">
    <h1>Payout {payout.id.slice(0, 8)}…</h1>
    <StatusBadge status={payout.status} />
  </div>

  <div class="grid">
    <div class="panel">
      <h2>Claim details</h2>
      <dl>
        <dt>Raffle</dt>
        <dd>{payout.raffleId}</dd>
        <dt>Winner</dt>
        <dd>{payout.winnerUserId}</dd>
        <dt>Claim deadline</dt>
        <dd class:overdue={deadlinePassed}>{new Date(payout.claimDeadline).toLocaleString()}</dd>
        <dt>Delivery address</dt>
        <dd>{payout.deliveryAddress ?? '—'}</dd>
        <dt>Delivery phone</dt>
        <dd>{payout.deliveryPhone ?? '—'}</dd>
      </dl>

      {#if payout.idDocumentUrl}
        <a class="id-doc" href={payout.idDocumentUrl} target="_blank" rel="noreferrer">
          View submitted ID document ↗
        </a>
      {:else}
        <p class="hint">No ID document submitted yet.</p>
      {/if}
    </div>

    <div class="panel">
      <h2>Review</h2>
      <label for="notes">Admin notes</label>
      <textarea id="notes" rows="3" bind:value={notes} placeholder="Optional notes for this decision"></textarea>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="actions">
        <button
          class="verify"
          disabled={updating || payout.status !== 'claimed'}
          on:click={() => updateStatus('verified')}
        >
          Verify
        </button>
        <button
          class="fulfill"
          disabled={updating || payout.status !== 'verified'}
          on:click={() => updateStatus('fulfilled')}
        >
          Mark fulfilled
        </button>
        <button
          class="reject"
          disabled={updating || !['claimed', 'verified'].includes(payout.status)}
          on:click={() => updateStatus('rejected')}
        >
          Reject
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    margin-bottom: var(--space-24);
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
  }

  h2 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: var(--space-16);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-20);
  }

  .panel {
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-20);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-8) var(--space-16);
    font-size: 14px;
    margin-bottom: var(--space-16);
  }

  dt {
    color: var(--color-text-secondary);
  }

  dd {
    font-weight: 600;
    word-break: break-all;
  }

  .overdue {
    color: var(--color-danger);
  }

  .id-doc {
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
  }

  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
  }

  textarea {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-button);
    padding: var(--space-8) var(--space-12);
    font-size: 14px;
    font-family: var(--font-family);
    margin-bottom: var(--space-16);
  }

  .error {
    font-size: 13px;
    color: var(--color-danger);
    margin-bottom: var(--space-12);
  }

  .actions {
    display: flex;
    gap: var(--space-8);
  }

  .actions button {
    flex: 1;
    border: none;
    border-radius: var(--radius-button);
    padding: var(--space-8) var(--space-12);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .verify {
    background: var(--color-primary-bg);
    color: var(--color-primary);
  }

  .fulfill {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  .reject {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 13px;
  }
</style>
