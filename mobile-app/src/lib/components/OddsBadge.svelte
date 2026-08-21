<script lang="ts">
  /**
   * Displays a participant's ticket-weighted win odds for a raffle.
   *
   * TODO: once the API exposes an odds endpoint backed by the
   * `v_user_raffle_odds` view, replace this client-side estimate with
   * the server-computed value (it accounts for per-user ticket caps and
   * any weighting rules that live in the DB, which this cannot see).
   */
  export let ticketsOwned: number;
  export let ticketsSold: number;

  $: odds = ticketsSold > 0 ? (ticketsOwned / ticketsSold) * 100 : 0;
  $: display = odds === 0 ? '0%' : odds < 0.1 ? '<0.1%' : `${odds.toFixed(1)}%`;
</script>

<span class="odds-badge">
  <span class="dot"></span>
  {display} win odds
</span>

<style>
  .odds-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    padding: 4px var(--space-12);
    border-radius: 999px;
    background: var(--color-blue-bg);
    color: var(--color-blue);
    font-size: 12px;
    font-weight: 600;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-blue);
  }
</style>
