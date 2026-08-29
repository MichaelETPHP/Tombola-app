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

<span class="inline-flex items-center gap-2 rounded-full bg-blue-bg px-3 py-1 text-xs font-semibold text-blue">
  <span class="h-1.5 w-1.5 rounded-full bg-blue"></span>
  {display} win odds
</span>
