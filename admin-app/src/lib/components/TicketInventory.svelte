<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { ChevronLeft, ChevronRight, RefreshCw, Ticket } from 'lucide-svelte';
  export let raffleId: string;
  type Inventory = { publicCode: string; ticketCap: number; start: number; end: number; numbers: { number: number; state: string }[]; payments: { id: string; selectedNumbers: number[]; amount: number; reviewRequired: boolean; checkoutStartedAt: string | null; createdAt: string }[] };
  let inventory: Inventory | null = null;
  let start = 1;
  let error = '';
  let loading = false;
  let busy = '';
  let refundId = '';
  let refundReference = '';
  let refundCompleted = false;
  let search = '';
  const numberLabel = (n: number) => String(n).padStart(5, '0');
  function message(cause: unknown) { if (cause instanceof ApiError) { try { return JSON.parse(cause.body).error; } catch {} } return 'Could not complete this action. Please retry.'; }
  async function load() { loading = true; error = ''; try { inventory = await api.get<Inventory>(`/admin/raffles/${raffleId}/ticket-inventory?start=${start}`); } catch (cause) { error = message(cause); } finally { loading = false; } }
  onMount(load);
  async function reconcile(id: string) { busy = id; error = ''; try { await api.post(`/admin/payments/${id}/reconcile`); await load(); } catch (cause) { error = message(cause); } finally { busy = ''; } }
  async function recordRefund() { busy = refundId; try { await api.post(`/admin/payments/${refundId}/record-refund`, { reference: refundReference, refundCompleted }); refundId = ''; refundReference = ''; refundCompleted = false; await load(); } catch (cause) { error = message(cause); } finally { busy = ''; } }
  function find() { const n = Number(search); if (!Number.isInteger(n) || n < 1 || !inventory || n > inventory.ticketCap) { error = 'Enter a number within this raffle’s ticket range.'; return; } start = Math.floor((n - 1) / 60) * 60 + 1; load(); }
</script>

<section class="inventory">
  <header><div><h2><Ticket size={19} /> Ticket numbers</h2><p>Participants choose their numbers. Each number is unique within this raffle.</p></div><button class="icon-control" on:click={load} disabled={loading} aria-label="Refresh ticket inventory"><RefreshCw size={17} /></button></header>
  {#if error}<p class="inventory-error" role="alert">{error}</p>{/if}
  {#if inventory}
    <div class="inventory-toolbar"><form on:submit|preventDefault={find}><input aria-label="Find ticket number" inputmode="numeric" placeholder="Find number" bind:value={search} /><button>Find</button></form><span>{inventory.publicCode} · 00001–{numberLabel(inventory.ticketCap)}</span></div>
    <div class="inventory-legend"><span>Available</span><span class="held-label">Held</span><span class="sold-label">Sold</span></div>
    <nav aria-label="Ticket inventory pages"><button class="icon-control" disabled={start === 1 || loading} aria-label="Previous ticket numbers" on:click={() => { start = Math.max(1, start - 60); load(); }}><ChevronLeft size={18} /></button><span>{numberLabel(inventory.start)}–{numberLabel(inventory.end)}</span><button class="icon-control" disabled={inventory.end >= inventory.ticketCap || loading} aria-label="Next ticket numbers" on:click={() => { start += 60; load(); }}><ChevronRight size={18} /></button></nav>
    <div class="inventory-grid">{#each inventory.numbers as item}<span class:held={item.state === 'held'} class:sold={item.state === 'sold'} title="{inventory.publicCode}-{numberLabel(item.number)} · {item.state}">{numberLabel(item.number)}<small>{item.state}</small></span>{/each}</div>
    <div class="pending-orders"><h3>Checkouts to reconcile</h3><p>Held numbers cannot be sold again. Resolve pending payments before closing the raffle or drawing.</p>
      {#if !inventory.payments.length}<p class="empty-inventory">No pending checkouts or payment reviews.</p>{/if}
      {#each inventory.payments as payment}
        <article><div><strong>{payment.reviewRequired ? 'Verified charge · refund review' : payment.checkoutStartedAt ? 'Awaiting gateway confirmation' : 'Reserved · payment not started'}</strong><p class="order-numbers">{(payment.selectedNumbers ?? []).map(numberLabel).join(' · ')}</p><p>{Number(payment.amount).toLocaleString()} ETB · {new Date(payment.createdAt).toLocaleString()}</p><small class="payment-reference">{payment.id}</small></div>
          {#if $auth.admin?.role === 'owner'}<div class="order-actions"><button disabled={!!busy} on:click={() => reconcile(payment.id)}>{busy === payment.id ? 'Checking…' : 'Check gateway'}</button>{#if payment.reviewRequired}<button disabled={!!busy} on:click={() => { refundId = payment.id; refundReference = ''; refundCompleted = false; }}>Record external refund</button>{/if}</div>{/if}
        </article>
        {#if refundId === payment.id}<form class="refund-form" on:submit|preventDefault={recordRefund}><p>This records a refund already completed with the provider. It does not send money.</p><label>Provider refund reference<input required minlength="5" maxlength="200" bind:value={refundReference} /></label><label class="refund-confirm"><input type="checkbox" required bind:checked={refundCompleted} /> I verified that the refund was completed.</label><div><button disabled={!!busy || !refundCompleted || refundReference.trim().length < 5}>Save refund record</button><button type="button" on:click={() => { refundId = ''; }}>Cancel</button></div></form>{/if}
      {/each}
    </div>
  {:else if loading}<p class="empty-inventory">Loading ticket inventory…</p>{/if}
</section>

<style>
  .inventory { background: var(--color-card, #fff); color: var(--color-ink, #18251f); padding: 24px; border: 1px solid var(--color-border, #dde5df); border-radius: 16px; margin-top: 24px; }
  header { display: flex; justify-content: space-between; gap: 16px; } h2 { display: flex; gap: 9px; align-items: center; font-size: 17px; font-weight: 700; } header p, .pending-orders > p { font-size: 13px; line-height: 1.7; color: #566960; margin-top: 8px; } .icon-control { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; border-radius: 10px; }
  .inventory-toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 22px; font-size: 12px; } form input:not([type=checkbox]) { min-height: 44px; min-width: 0; border: 1px solid #b7c8be; border-radius: 8px; padding: 8px 12px; } form button, .order-actions button { min-height: 44px; padding: 8px 12px; border-radius: 8px; background: #e6f3ec; color: #174634; font-size: 12px; font-weight: 650; } .inventory-toolbar form { display: flex; gap: 8px; } .inventory-toolbar input { width: 160px; }
  .inventory-legend { display: flex; gap: 18px; margin-top: 22px; font-size: 12px; } .held-label { color: #805e14; } .sold-label { color: #17684d; } nav { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
  .inventory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(68px, 1fr)); gap: 8px; } .inventory-grid > span { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 52px; border: 1px solid #d0ddd5; border-radius: 8px; font-size: 13px; font-variant-numeric: tabular-nums; } .inventory-grid small { font-size: 9px; color: #566960; margin-top: 2px; } .inventory-grid .held { background: #fff4d6; border-color: #c8a456; } .inventory-grid .sold { background: #dff0e7; border-color: #80ad98; }
  .pending-orders { margin-top: 28px; } h3 { font-size: 15px; font-weight: 700; } .empty-inventory { padding: 20px 0; font-size: 13px; color: #566960; } article { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 18px 0; border-bottom: 1px solid #dbe5de; font-size: 12px; } article strong { font-size: 13px; } article p { margin-top: 5px; color: #566960; } .order-numbers { font-variant-numeric: tabular-nums; font-weight: 700; } .payment-reference { display: block; overflow-wrap: anywhere; color: #566960; margin-top: 5px; } .order-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .refund-form { display: grid; gap: 12px; padding: 18px; background: #f3f6f4; font-size: 13px; line-height: 1.6; } .refund-form label { display: grid; gap: 6px; } .refund-form .refund-confirm { display: flex; align-items: center; gap: 10px; min-height: 44px; } .refund-form > div { display: flex; gap: 10px; } .inventory-error { color: #992b40; background: #fff0f1; padding: 12px; border-radius: 8px; margin-top: 14px; font-size: 13px; }
  button:disabled { opacity: .5; } button:focus-visible, input:focus-visible { outline: 2px solid #17684d; outline-offset: 3px; } @media (max-width: 480px) { .inventory { padding: 16px; } }
</style>
