<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';

  interface DashboardStats {
    activeRaffles: number;
    openRaffles: number;
    lockedRaffles: number;
    pendingPayouts: number;
    expiringPayouts: { id: string; raffleId: string; claimDeadline: string; status: string }[];
  }

  let stats: DashboardStats | null = null;
  let loading = true;

  onMount(async () => {
    try {
      stats = await api.get<DashboardStats>('/admin/dashboard');
    } catch (err) {
      console.error('Failed to load dashboard stats', err);
    } finally {
      loading = false;
    }
  });
</script>

<h1>Overview</h1>

{#if loading}
  <p class="hint">Loading…</p>
{:else if !stats}
  <p class="hint">Could not load dashboard stats.</p>
{:else}
  <div class="stats-grid">
    <div class="stat-card">
      <span class="value">{stats.activeRaffles}</span>
      <span class="label">Active raffles</span>
    </div>
    <div class="stat-card">
      <span class="value">{stats.openRaffles}</span>
      <span class="label">Open</span>
    </div>
    <div class="stat-card">
      <span class="value">{stats.lockedRaffles}</span>
      <span class="label">Locked</span>
    </div>
    <div class="stat-card">
      <span class="value">{stats.pendingPayouts}</span>
      <span class="label">Payouts near deadline</span>
    </div>
  </div>

  <section class="panel">
    <h2>Payouts approaching claim deadline</h2>
    {#if stats.expiringPayouts.length === 0}
      <p class="hint">Nothing urgent right now.</p>
    {:else}
      <ul class="expiring-list">
        {#each stats.expiringPayouts as payout (payout.id)}
          <li>
            <span>Raffle {payout.raffleId}</span>
            <StatusBadge status={payout.status} />
            <span class="deadline">Due {new Date(payout.claimDeadline).toLocaleString()}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: var(--space-24);
  }

  h2 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: var(--space-16);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-16);
    margin-bottom: var(--space-32);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-20);
  }

  .value {
    font-size: 28px;
    font-weight: 800;
  }

  .label {
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .panel {
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-20);
  }

  .expiring-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    list-style: none;
  }

  .expiring-list li {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    font-size: 14px;
  }

  .deadline {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: 13px;
  }
</style>
