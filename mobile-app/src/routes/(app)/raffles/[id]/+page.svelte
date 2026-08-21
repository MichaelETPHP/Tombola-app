<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import type { Raffle } from '$lib/stores/raffles.store.js';
  import Button from '$lib/components/Button.svelte';
  import OddsBadge from '$lib/components/OddsBadge.svelte';

  let raffle: Raffle | null = null;
  let loading = true;
  let quantity = 1;
  let purchasing = false;
  let error = '';
  let purchased = false;

  onMount(async () => {
    try {
      const res = await api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, {
        skipAuth: true,
      });
      raffle = res.raffle;
    } catch (err) {
      error = 'Could not load this raffle.';
    } finally {
      loading = false;
    }
  });

  async function purchase() {
    if (!raffle) return;
    error = '';
    purchasing = true;
    try {
      await api.post(`/raffles/${raffle.id}/tickets`, { quantity, paymentGateway: 'chapa' });
      purchased = true;
    } catch (err) {
      error = err instanceof ApiError ? 'Purchase failed. Please try again.' : 'Network error.';
    } finally {
      purchasing = false;
    }
  }

  $: soldPct = raffle ? Math.min(100, (raffle.ticketsSold / raffle.ticketCap) * 100) : 0;
</script>

<div class="detail">
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if !raffle}
    <p class="hint">{error || 'Raffle not found.'}</p>
  {:else}
    <div class="prize-image" style={raffle.prizeImageUrl ? `background-image: url(${raffle.prizeImageUrl})` : ''}>
      {#if !raffle.prizeImageUrl}
        <span class="placeholder">🎁</span>
      {/if}
    </div>

    <h1>{raffle.title}</h1>
    <p class="prize-name">{raffle.prizeName} · worth {raffle.prizeValue} ETB</p>
    {#if raffle.description}
      <p class="description">{raffle.description}</p>
    {/if}

    <div class="card">
      <div class="progress-track">
        <div class="progress-fill" style="width: {soldPct}%"></div>
      </div>
      <div class="meta-row">
        <span>{raffle.ticketsSold}/{raffle.ticketCap} tickets sold</span>
        <span>{raffle.ticketPrice} ETB / ticket</span>
      </div>
      <OddsBadge ticketsOwned={quantity} ticketsSold={raffle.ticketsSold + quantity} />
    </div>

    {#if purchased}
      <p class="success">🎉 Tickets purchased! Good luck.</p>
    {:else if raffle.status === 'open'}
      <div class="purchase-card">
        <label for="qty">Quantity</label>
        <div class="stepper">
          <button on:click={() => (quantity = Math.max(1, quantity - 1))}>−</button>
          <span id="qty">{quantity}</span>
          <button on:click={() => (quantity = Math.min(raffle!.maxTicketsPerUser, quantity + 1))}>+</button>
        </div>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <Button loading={purchasing} on:click={purchase}>
          Buy {quantity} ticket{quantity > 1 ? 's' : ''} — {quantity * raffle.ticketPrice} ETB
        </Button>
      </div>
    {:else}
      <p class="hint">This raffle is {raffle.status} — tickets are no longer available.</p>
    {/if}
  {/if}
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  .prize-image {
    height: 180px;
    border-radius: var(--radius-card);
    background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end));
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder {
    font-size: 48px;
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .prize-name {
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .description {
    font-size: 14px;
    color: var(--color-text-primary);
  }

  .card,
  .purchase-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-16);
  }

  .progress-track {
    height: 6px;
    border-radius: 3px;
    background: var(--color-dot-inactive);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-24);
  }

  .stepper button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--bg-gradient-start);
    color: var(--color-primary-dark);
    font-size: 20px;
    font-weight: 700;
    cursor: pointer;
  }

  .stepper span {
    font-size: 20px;
    font-weight: 700;
    min-width: 24px;
    text-align: center;
  }

  .success {
    text-align: center;
    font-weight: 600;
    color: var(--color-primary-dark);
  }

  .error {
    font-size: 13px;
    color: var(--color-coral-start);
    text-align: center;
  }

  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
  }
</style>
