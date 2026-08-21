<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';

  interface Payout {
    id: string;
    raffleId: string;
    status: 'pending_claim' | 'claimed' | 'verified' | 'fulfilled' | 'expired' | 'rejected';
    claimDeadline: string;
    createdAt: string;
  }

  let payouts: Payout[] = [];
  let loading = true;

  const statusLabels: Record<Payout['status'], string> = {
    pending_claim: 'Claim your prize',
    claimed: 'Claim under review',
    verified: 'Verified — preparing delivery',
    fulfilled: 'Delivered',
    expired: 'Claim window expired',
    rejected: 'Claim rejected',
  };

  onMount(async () => {
    try {
      const res = await api.get<{ payouts: Payout[] }>('/payouts/mine');
      payouts = res.payouts;
    } catch (err) {
      console.error('Failed to load wins', err);
    } finally {
      loading = false;
    }
  });
</script>

<div class="wins-page">
  <h1>My wins</h1>

  {#if loading}
    <p class="hint">Loading…</p>
  {:else if payouts.length === 0}
    <p class="hint">No wins yet — keep entering raffles!</p>
  {:else}
    <div class="list">
      {#each payouts as payout (payout.id)}
        <div class="win-card">
          <span class="trophy">🏆</span>
          <div class="info">
            <span class="status">{statusLabels[payout.status]}</span>
            {#if payout.status === 'pending_claim'}
              <span class="deadline">
                Claim by {new Date(payout.claimDeadline).toLocaleDateString()}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wins-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .win-card {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-16);
    text-decoration: none;
    color: inherit;
  }

  .trophy {
    font-size: 24px;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status {
    font-size: 14px;
    font-weight: 700;
  }

  .deadline {
    font-size: 12px;
    color: var(--color-coral-start);
  }
</style>
