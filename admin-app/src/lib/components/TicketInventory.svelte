<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { api, ApiError, API_BASE } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { ChevronLeft, ChevronRight, RefreshCw, Ticket, X } from 'lucide-svelte';
  export let raffleId: string;
  type Inventory = { publicCode: string; ticketCap: number; start: number; end: number; numbers: { number: number; state: string; displayNumber: string }[]; payments: { id: string; selectedDisplayNumbers: string[]; amount: number; reviewRequired: boolean; checkoutStartedAt: string | null; createdAt: string }[] };
  type TicketBuyer = {
    displayNumber: string; buyerName: string | null; buyerPhone: string; amount: number; createdAt: string;
    paymentStatus: string; isSold: boolean; reviewRequired: boolean; reservationExpiresAt: string | null;
  };
  let inventory: Inventory | null = null;
  let start = 1;
  let error = '';
  let loading = false;
  let busy = '';
  let refundId = '';
  let refundReference = '';
  let refundCompleted = false;
  let search = '';
  function message(cause: unknown) { if (cause instanceof ApiError) { try { return JSON.parse(cause.body).error; } catch {} } return 'Could not complete this action. Please retry.'; }
  async function load() { loading = true; error = ''; try { inventory = await api.get<Inventory>(`/admin/raffles/${raffleId}/ticket-inventory?start=${start}`); } catch (cause) { error = message(cause); } finally { loading = false; } }
  onMount(load);

  // Buyer modal — opened by clicking a sold or held ticket number.
  let buyerModalOpen = false;
  let buyerLoading = false;
  let buyerError = '';
  let buyer: TicketBuyer | null = null;
  let buyerNumber: number | null = null;

  async function openBuyer(number: number) {
    buyerModalOpen = true;
    buyerLoading = true;
    buyerError = '';
    buyer = null;
    buyerNumber = number;
    confirmingRelease = false;
    releaseError = '';
    try {
      buyer = await api.get<TicketBuyer>(`/admin/raffles/${raffleId}/tickets/${number}/buyer`);
    } catch (cause) {
      buyerError = message(cause);
    } finally {
      buyerLoading = false;
    }
  }
  function closeBuyer() { buyerModalOpen = false; }
  function onBuyerModalKeydown(event: KeyboardEvent) { if (event.key === 'Escape') closeBuyer(); }
  function focusOnMount(node: HTMLElement) { node.focus(); }

  // Release — only ever offered for a plain, unpaid hold (never a verified
  // charge stuck in review; the server enforces this too, this is just so
  // the button isn't even shown for a case it would refuse). A deliberate
  // extra confirm step, not a single click — this puts an active
  // reservation back into circulation, which is exactly the kind of thing
  // that shouldn't happen by accident.
  let confirmingRelease = false;
  let releasing = false;
  let releaseError = '';

  async function releaseHeldTicket() {
    if (buyerNumber === null || releasing) return;
    releasing = true;
    releaseError = '';
    try {
      await api.post(`/admin/raffles/${raffleId}/tickets/${buyerNumber}/release`, {});
      closeBuyer();
      await load();
    } catch (cause) {
      releaseError = message(cause);
      confirmingRelease = false;
    } finally {
      releasing = false;
    }
  }

  // Live updates — a ticket sold anywhere reaches every admin tab with
  // this raffle's grid open, no polling and no manual refresh. Only
  // patches numbers that fall on the page currently being viewed; a sale
  // on a different page just shows up whenever that page is opened next
  // (load() already fetches fresh state then).
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let connecting = false;

  async function connectLiveUpdates() {
    if (destroyed || connecting || socket || !get(auth).accessToken) return;
    connecting = true;
    try {
      const { ticket } = await api.post<{ ticket: string }>(`/admin/raffles/${raffleId}/ticket-updates/ticket`);
      if (destroyed || !get(auth).accessToken) return;
      const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/admin/raffles/${raffleId}/ticket-updates`;
      socket = new WebSocket(wsUrl, [`ticket.${ticket}`]);
    } catch {
      if (!destroyed && get(auth).accessToken) reconnectTimer = setTimeout(connectLiveUpdates, 3000);
      return;
    } finally { connecting = false; }
    socket.onmessage = (event) => {
      if (!inventory) return;
      try {
        const msg = JSON.parse(event.data) as { type: string; tickets: { number: number; displayNumber: string }[] };
        if (msg.type !== 'tickets_sold') return;
        const sold = new Map(msg.tickets.map((t) => [t.number, t.displayNumber]));
        inventory = {
          ...inventory,
          numbers: inventory.numbers.map((row) =>
            sold.has(row.number) ? { ...row, state: 'sold', displayNumber: sold.get(row.number)! } : row
          ),
        };
      } catch {
        // Malformed/unknown message — ignore, the grid just stays as-is.
      }
    };
    // A closed socket (deploy, idle timeout, network blip) reconnects on
    // its own rather than leaving the grid silently stale until a manual
    // refresh — same reasoning as this app's other live-ish polling loops.
    socket.onclose = () => {
      socket = null;
      if (!destroyed && get(auth).accessToken) reconnectTimer = setTimeout(connectLiveUpdates, 3000);
    };
  }

  onMount(connectLiveUpdates);
  onDestroy(() => {
    destroyed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) {
      // Detach first — an intentional close on unmount must not trigger
      // onclose's own reconnect-in-3s, which would otherwise open a fresh
      // socket for a raffle nobody's viewing anymore.
      socket.onclose = null;
      socket.close();
    }
  });
  async function reconcile(id: string) { busy = id; error = ''; try { await api.post(`/admin/payments/${id}/reconcile`); await load(); } catch (cause) { error = message(cause); } finally { busy = ''; } }
  async function recordRefund() { busy = refundId; try { await api.post(`/admin/payments/${refundId}/record-refund`, { reference: refundReference, refundCompleted }); refundId = ''; refundReference = ''; refundCompleted = false; await load(); } catch (cause) { error = message(cause); } finally { busy = ''; } }
  // Search takes the same 6-digit scrambled ticket code shown everywhere
  // else (customer wheel, receipts, SMS) — not the internal 1..ticketCap
  // index, which is never shown to anyone. The server resolves it (see
  // ticket-admin.ts::findTicketNumberForDisplay) since there's no
  // closed-form inverse for the cipher.
  async function find() {
    const query = search.replace(/\D/g, '');
    if (query.length !== 6) { error = 'Enter the full 6-digit ticket number.'; return; }
    loading = true; error = '';
    try { inventory = await api.get<Inventory>(`/admin/raffles/${raffleId}/ticket-inventory?find=${query}`); start = inventory.start; }
    catch (cause) { error = message(cause); }
    finally { loading = false; }
  }
</script>

<section class="inventory">
  <header><div><h2><Ticket size={19} /> Ticket numbers</h2><p>Participants choose their numbers. Each number is unique within this raffle.</p></div><button class="icon-control" on:click={load} disabled={loading} aria-label="Refresh ticket inventory"><RefreshCw size={17} /></button></header>
  {#if error}<p class="inventory-error" role="alert">{error}</p>{/if}
  {#if inventory}
    <div class="inventory-toolbar"><form on:submit|preventDefault={find}><input aria-label="Find ticket number" inputmode="numeric" maxlength="6" placeholder="Find 6-digit number" bind:value={search} /><button>Find</button></form><span>{inventory.publicCode} · {inventory.ticketCap} tickets</span></div>
    <div class="inventory-legend"><span class="available-label">Active</span><span class="held-label">Held</span><span class="sold-label">Bought</span></div>
    <nav aria-label="Ticket inventory pages"><button class="icon-control" disabled={start === 1 || loading} aria-label="Previous ticket numbers" on:click={() => { start = Math.max(1, start - 60); load(); }}><ChevronLeft size={18} /></button><span>Tickets {inventory.start}–{inventory.end} of {inventory.ticketCap}</span><button class="icon-control" disabled={inventory.end >= inventory.ticketCap || loading} aria-label="Next ticket numbers" on:click={() => { start += 60; load(); }}><ChevronRight size={18} /></button></nav>
    <div class="inventory-grid">{#each inventory.numbers as item (item.number)}
      {#if item.state === 'sold'}
        <button type="button" class="sold" title="{inventory.publicCode}-{item.displayNumber} · sold — click for buyer" on:click={() => openBuyer(item.number)}>{item.displayNumber}<small>Bought</small></button>
      {:else if item.state === 'held'}
        <button type="button" class="held" title="{inventory.publicCode}-{item.displayNumber} · held — click for details" on:click={() => openBuyer(item.number)}>{item.displayNumber}<small>Held</small></button>
      {:else}
        <span class="available" title="{inventory.publicCode}-{item.displayNumber} · available">{item.displayNumber}<small>Active</small></span>
      {/if}
    {/each}</div>
    <div class="pending-orders"><h3>Checkouts to reconcile</h3><p>Held numbers cannot be sold again. Resolve pending payments before closing the raffle or drawing.</p>
      {#if !inventory.payments.length}<p class="empty-inventory">No pending checkouts or payment reviews.</p>{/if}
      {#each inventory.payments as payment}
        <article><div><strong>{payment.reviewRequired ? 'Verified charge · refund review' : payment.checkoutStartedAt ? 'Awaiting gateway confirmation' : 'Reserved · payment not started'}</strong><p class="order-numbers">{(payment.selectedDisplayNumbers ?? []).join(' · ')}</p><p>{Number(payment.amount).toLocaleString()} ETB · {new Date(payment.createdAt).toLocaleString()}</p><small class="payment-reference">{payment.id}</small></div>
          {#if $auth.admin?.role === 'owner'}<div class="order-actions"><button disabled={!!busy} on:click={() => reconcile(payment.id)}>{busy === payment.id ? 'Checking…' : 'Check gateway'}</button>{#if payment.reviewRequired}<button disabled={!!busy} on:click={() => { refundId = payment.id; refundReference = ''; refundCompleted = false; }}>Record external refund</button>{/if}</div>{/if}
        </article>
        {#if refundId === payment.id}<form class="refund-form" on:submit|preventDefault={recordRefund}><p>This records a refund already completed with the provider. It does not send money.</p><label>Provider refund reference<input required minlength="5" maxlength="200" bind:value={refundReference} /></label><label class="refund-confirm"><input type="checkbox" required bind:checked={refundCompleted} /> I verified that the refund was completed.</label><div><button disabled={!!busy || !refundCompleted || refundReference.trim().length < 5}>Save refund record</button><button type="button" on:click={() => { refundId = ''; }}>Cancel</button></div></form>{/if}
      {/each}
    </div>
  {:else if loading}<p class="empty-inventory">Loading ticket inventory…</p>{/if}
</section>

{#if buyerModalOpen}
  <div class="buyer-backdrop" role="presentation" on:click={closeBuyer}>
    <div class="buyer-modal" role="dialog" aria-modal="true" aria-label="Ticket buyer" tabindex="-1" use:focusOnMount on:click|stopPropagation on:keydown={onBuyerModalKeydown}>
      <button type="button" class="buyer-close icon-control" aria-label="Close" on:click={closeBuyer}><X size={18} /></button>
      {#if buyerLoading}
        <p class="empty-inventory">Loading buyer…</p>
      {:else if buyerError}
        <p class="inventory-error" role="alert">{buyerError}</p>
      {:else if buyer}
        <h3>Ticket {buyer.displayNumber}</h3>
        {#if !buyer.isSold}
          <p class="hold-banner">
            {buyer.reviewRequired
              ? 'Payment verified but not yet resolved — see Checkouts to reconcile below.'
              : 'Reservation in progress — this number is locked to this checkout until it completes or expires.'}
          </p>
        {/if}
        <dl>
          <dt>{buyer.isSold ? 'Buyer' : 'Holder'}</dt><dd>{buyer.buyerName || 'No name on file'}</dd>
          <dt>Phone</dt><dd>{buyer.buyerPhone}</dd>
          <dt>{buyer.isSold ? 'Paid' : 'Amount due'}</dt><dd>{Number(buyer.amount).toLocaleString()} ETB</dd>
          <dt>{buyer.isSold ? 'Purchased' : 'Reserved'}</dt><dd>{new Date(buyer.createdAt).toLocaleString()}</dd>
          {#if !buyer.isSold && buyer.reservationExpiresAt}
            <dt>Expires</dt><dd>{new Date(buyer.reservationExpiresAt).toLocaleString()}</dd>
          {/if}
          <dt>Status</dt><dd>{buyer.isSold ? 'Sold' : buyer.reviewRequired ? 'Payment review' : buyer.paymentStatus}</dd>
        </dl>

        {#if !buyer.isSold && !buyer.reviewRequired && $auth.admin?.role === 'owner'}
          {#if releaseError}<p class="inventory-error" role="alert">{releaseError}</p>{/if}
          {#if confirmingRelease}
            <div class="release-confirm">
              <p>Free ticket {buyer.displayNumber} for someone else to buy? This can't be undone — if {buyer.buyerName || 'this holder'} completes their payment after this, it goes to review instead of issuing automatically.</p>
              <div class="release-confirm-actions">
                <button type="button" disabled={releasing} on:click={() => (confirmingRelease = false)}>Cancel</button>
                <button type="button" class="release-danger" disabled={releasing} on:click={releaseHeldTicket}>
                  {releasing ? 'Releasing…' : 'Yes, release it'}
                </button>
              </div>
            </div>
          {:else}
            <button type="button" class="release-trigger" on:click={() => (confirmingRelease = true)}>Release this number</button>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .inventory { background: var(--color-card, #fff); color: var(--color-ink, #1a1d29); padding: 24px; border: 1px solid var(--color-border, #e2e5ee); border-radius: 16px; margin-top: 24px; }
  header { display: flex; justify-content: space-between; gap: 16px; } h2 { display: flex; gap: 9px; align-items: center; font-size: 17px; font-weight: 700; } header p, .pending-orders > p { font-size: 13px; line-height: 1.7; color: #5b6472; margin-top: 8px; } .icon-control { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; border-radius: 10px; }
  .inventory-toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 22px; font-size: 12px; } form input:not([type=checkbox]) { min-height: 44px; min-width: 0; border: 1px solid #d7dce6; border-radius: 8px; padding: 8px 12px; } form button, .order-actions button { min-height: 44px; padding: 8px 12px; border-radius: 8px; background: #dce6fb; color: #0135c6; font-size: 12px; font-weight: 650; } .inventory-toolbar form { display: flex; gap: 8px; } .inventory-toolbar input { width: 160px; }
  .inventory-legend { display: flex; gap: 18px; margin-top: 22px; font-size: 12px; } .available-label { color: #1a8f4c; } .held-label { color: #805e14; } .sold-label { color: #b0202f; } nav { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
  .inventory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(68px, 1fr)); gap: 8px; }
  .inventory-grid > span, .inventory-grid > button { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 52px; border: 1px solid #d7dce6; border-radius: 8px; font-size: 13px; font-variant-numeric: tabular-nums; font-family: inherit; }
  .inventory-grid small { font-size: 9px; margin-top: 2px; }
  .inventory-grid .available { background: #e7f7ee; border-color: #7fcba0; color: #146336; } .inventory-grid .available small { color: #1a8f4c; }
  .inventory-grid .held { background: #fff4d6; border-color: #c8a456; color: #6b4d0f; } .inventory-grid .held small { color: #805e14; }
  .inventory-grid button.held { cursor: pointer; } .inventory-grid button.held:hover { background: #ffecc0; }
  .inventory-grid button.held:focus-visible { outline: 2px solid #805e14; outline-offset: 2px; }
  .inventory-grid button.sold { background: #fdeaec; border-color: #e79aa4; color: #7d1523; cursor: pointer; text-decoration: line-through; text-decoration-thickness: 1.5px; } .inventory-grid button.sold small { color: #b0202f; text-decoration: none; }
  .inventory-grid button.sold:hover { background: #fbdadd; }
  .inventory-grid button.sold:focus-visible { outline: 2px solid #b0202f; outline-offset: 2px; }
  .buyer-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgb(15 30 24 / 45%); padding: 16px; }
  .buyer-modal { position: relative; width: min(360px, 100%); background: var(--color-card, #fff); color: var(--color-ink, #1a1d29); border-radius: 16px; padding: 24px; box-shadow: 0 20px 50px -20px rgb(0 0 0 / 40%); }
  .buyer-close { position: absolute; top: 10px; right: 10px; }
  .buyer-modal h3 { font-size: 16px; font-weight: 700; margin-bottom: 14px; }
  .hold-banner { margin: -6px 0 14px; padding: 10px 12px; border-radius: 8px; background: #fff4d6; color: #6b4d0f; font-size: 12px; line-height: 1.5; }
  .buyer-modal dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font-size: 13px; }
  .buyer-modal dt { color: #5b6472; font-weight: 600; } .buyer-modal dd { text-align: right; }
  .release-trigger { margin-top: 18px; width: 100%; min-height: 44px; border: 1px solid #e79aa4; border-radius: 8px; background: #fdeaec; color: #7d1523; font-weight: 650; font-size: 13px; }
  .release-trigger:hover { background: #fbdadd; }
  .release-confirm { margin-top: 18px; padding: 14px; border-radius: 8px; background: #fff0f1; border: 1px solid #f0c6cb; }
  .release-confirm p { font-size: 12px; line-height: 1.6; color: #7d1523; }
  .release-confirm-actions { display: flex; gap: 8px; margin-top: 12px; }
  .release-confirm-actions button { flex: 1; min-height: 40px; border-radius: 8px; font-size: 12px; font-weight: 650; }
  .release-confirm-actions button:first-child { background: #fff; border: 1px solid #d7dce6; color: #1a1d29; }
  .release-danger { background: #b0202f; color: #fff; border: none; }
  .release-danger:disabled, .release-confirm-actions button:disabled { opacity: .6; }
  .pending-orders { margin-top: 28px; } h3 { font-size: 15px; font-weight: 700; } .empty-inventory { padding: 20px 0; font-size: 13px; color: #5b6472; } article { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 18px 0; border-bottom: 1px solid #e2e5ee; font-size: 12px; } article strong { font-size: 13px; } article p { margin-top: 5px; color: #5b6472; } .order-numbers { font-variant-numeric: tabular-nums; font-weight: 700; } .payment-reference { display: block; overflow-wrap: anywhere; color: #5b6472; margin-top: 5px; } .order-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .refund-form { display: grid; gap: 12px; padding: 18px; background: #f4f6fa; font-size: 13px; line-height: 1.6; } .refund-form label { display: grid; gap: 6px; } .refund-form .refund-confirm { display: flex; align-items: center; gap: 10px; min-height: 44px; } .refund-form > div { display: flex; gap: 10px; } .inventory-error { color: #992b40; background: #fff0f1; padding: 12px; border-radius: 8px; margin-top: 14px; font-size: 13px; }
  button:disabled { opacity: .5; } button:focus-visible, input:focus-visible { outline: 2px solid #0135c6; outline-offset: 3px; } @media (max-width: 480px) { .inventory { padding: 16px; } }
</style>
