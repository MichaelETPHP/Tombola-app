<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import type { Raffle } from '$lib/stores/raffles.store.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { playSelectionSound } from '$lib/native/selectionSound.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { openCheckout, paymentReturnTarget } from '$lib/native/browser.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import TicketNumberWheel from '$lib/components/TicketNumberWheel.svelte';
  import { ArrowLeft, ArrowRight, Check, CircleAlert, LockKeyhole, RefreshCw, Search, Ticket, X } from 'lucide-svelte';

  type NumberState = 'available' | 'sold' | 'owned' | 'held' | 'held_by_you';
  type Availability = {
    numbers: { number: number; state: NumberState }[];
    start: number; end: number; ticketCap: number; allowance: number; owned: number;
    activePaymentId: string | null; paymentStarted: boolean; salesOpen: boolean;
  };
  const pullRefresh = getPullRefreshContext();
  const pageSize = 5000;
  let raffle: Raffle | null = null;
  let availability: Availability | null = null;
  let selected: number[] = [];
  let wheelSlots: (number | null)[] = [null, null, null, null, null];
  let start = 1;
  let search = '';
  let error = '';
  let notice = '';
  let loading = true;
  let refreshing = false;
  let purchasing = false;
  let releasing = false;
  let requestKey = '';
  let conflicts: number[] = [];
  let resumePaymentId: string | null = null;
  let requestVersion = 0;
  let focusWheel = 0;
  let focusNumber: number | null = null;
  let focusNonce = 0;
  const numberLabel = (n: number) => String(n).padStart(5, '0');
  $: allowance = availability?.allowance ?? 0;
  $: total = selected.length * Number(raffle?.ticketPrice ?? 0);

  function commitSlots(next: (number | null)[]) {
    wheelSlots = next;
    selected = next.filter((number): number is number => number !== null);
    requestKey = '';
    conflicts = conflicts.filter((number) => selected.includes(number));
    saveDraft();
  }

  function saveDraft() {
    if (!$page.params.id) return;
    setPendingPurchase({ raffleId: $page.params.id, quantity: selected.length, selectedNumbers: selected, idempotencyKey: requestKey });
  }

  async function refresh() {
    if (!$auth.isAuthenticated) return;
    const version = ++requestVersion;
    refreshing = true;
    try {
      const data = await api.get<Availability>(`/raffles/${$page.params.id}/ticket-availability?start=${start}&limit=${pageSize}`);
      if (version !== requestVersion) return;
      availability = data;
      resumePaymentId = data.activePaymentId;
      conflicts = selected.filter((n) => data.numbers.some((row) => row.number === n && row.state !== 'available'));
      error = '';
    } catch {
      if (version === requestVersion) error = 'Could not refresh available numbers. Check your connection and retry.';
    } finally {
      if (version === requestVersion) { refreshing = false; loading = false; }
    }
  }

  onMount(() => {
    if (!$auth.isAuthenticated) {
      goto(`/login?returnTo=${encodeURIComponent($page.url.pathname)}`, { replaceState: true });
      return;
    }
    const draft = getPendingPurchase();
    if (draft && draft.raffleId === $page.params.id && Array.isArray(draft.selectedNumbers)) {
      selected = [...new Set(draft.selectedNumbers.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5);
      wheelSlots = [...selected, ...Array(5 - selected.length).fill(null)];
      requestKey = draft.idempotencyKey ?? '';
    }
    api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, { skipAuth: true })
      .then((data) => { raffle = data.raffle; })
      .catch(() => { error = 'Could not load this raffle. Go back and try again.'; });
    refresh();
    pullRefresh.set(refresh);
    const foreground = () => { if (!document.hidden && !purchasing) refresh(); };
    const timer = setInterval(foreground, 15000);
    document.addEventListener('visibilitychange', foreground);
    return () => { requestVersion++; clearInterval(timer); document.removeEventListener('visibilitychange', foreground); pullRefresh.set(null); };
  });

  function toggle(n: number) {
    if (purchasing) return;
    let selecting: boolean;
    const existingSlot = wheelSlots.indexOf(n);
    if (existingSlot >= 0) {
      const next = [...wheelSlots]; next[existingSlot] = null; commitSlots(next); selecting = false;
    }
    else if (selected.length < allowance) {
      const slot = wheelSlots.findIndex((number) => number === null);
      if (slot < 0) return;
      const next = [...wheelSlots]; next[slot] = n; commitSlots(next); selecting = true;
    }
    else { notice = `You can choose ${allowance} ticket${allowance === 1 ? '' : 's'} for this raffle.`; return; }
    notice = '';
    hapticLight();
    playSelectionSound(selecting);
  }

  function setWheelSelection(event: CustomEvent<{ slot: number; number: number | null }>) {
    const { slot, number } = event.detail;
    if (slot >= allowance && wheelSlots[slot] === null) {
      notice = `You can choose ${allowance} ticket${allowance === 1 ? '' : 's'} for this raffle.`;
      return;
    }
    if (number !== null && wheelSlots.some((value, index) => value === number && index !== slot)) return;
    const next = [...wheelSlots];
    next[slot] = number;
    commitSlots(next);
    notice = '';
    // The wheel already emits a restrained detent while moving; avoid
    // layering the louder tap-selection chirp over that native feedback.
  }

  function findNumber() {
    if (!availability) return;
    const n = Number(search);
    if (!/^\d+$/.test(search.trim()) || !Number.isSafeInteger(n) || n < 1 || n > availability.ticketCap) {
      notice = `Enter a number from 00001 to ${numberLabel(availability.ticketCap)}.`;
      return;
    }
    const row = availability.numbers.find((item) => item.number === n);
    if (!row) {
      notice = 'That number is outside the wheel range for this raffle.';
      return;
    }
    if (row.state !== 'available' && !selected.includes(n)) {
      notice = `${numberLabel(n)} is already unavailable. Try another lucky number.`;
      return;
    }
    const existingSlot = wheelSlots.indexOf(n);
    const slot = existingSlot >= 0 ? existingSlot : wheelSlots.findIndex((number) => number === null);
    if (slot < 0 || (slot >= allowance && existingSlot < 0)) {
      notice = `All ${allowance} ticket choices are filled. Clear one to search for another.`;
      return;
    }
    if (existingSlot < 0) {
      const next = [...wheelSlots]; next[slot] = n; commitSlots(next);
      playSelectionSound(true);
      void hapticLight();
    }
    focusWheel = slot;
    focusNumber = n;
    focusNonce += 1;
    notice = `${numberLabel(n)} is selected in choice ${slot + 1}.`;
  }

  async function releaseCheckout() {
    if (!resumePaymentId || releasing) return;
    releasing = true;
    await cancelPaymentAndReturnHome(resumePaymentId);
    selected = [];
    wheelSlots = [null, null, null, null, null];
    requestKey = '';
    conflicts = [];
    await refresh();
    releasing = false;
  }

  async function continueToCheckout() {
    if (!selected.length || purchasing || !raffle) return;
    purchasing = true;
    error = '';
    requestKey ||= crypto.randomUUID();
    saveDraft();
    try {
      const result = await api.post<{ paymentId: string; checkoutUrl?: string }>(`/raffles/${raffle.id}/tickets`, {
        selectedNumbers: selected, idempotencyKey: requestKey, paymentGateway: 'chapa', returnTarget: paymentReturnTarget(),
      });
      clearPendingPurchase();
      await openCheckout(result.checkoutUrl, result.paymentId);
    } catch (cause) {
      if (cause instanceof ApiError) {
        try {
          const body = JSON.parse(cause.body);
          error = body.error || 'Could not reserve your numbers. Please try again.';
          conflicts = body.details?.numbers ?? [];
          resumePaymentId = body.details?.paymentId ?? resumePaymentId;
          if (conflicts.length) { requestKey = ''; saveDraft(); }
        } catch { error = 'Could not reserve your numbers. Please try again.'; }
      } else error = 'Connection interrupted. Retry to safely check the same reservation.';
    } finally { purchasing = false; }
  }

  function resume() {
    if (resumePaymentId) goto(availability?.paymentStarted ? `/payments/${resumePaymentId}` : `/checkout?paymentId=${resumePaymentId}`);
  }
</script>

<svelte:head><title>Choose your numbers · YeneEta</title></svelte:head>

<div class="number-picker">
  <header class="picker-header">
    <a class="icon-button" href="/raffles/{$page.params.id}" aria-label="Back to raffle"><ArrowLeft size={21} /></a>
    <div><p>{raffle?.title ?? 'Your raffle'}</p><span>Choose tickets</span></div>
    <span class="header-ticket" aria-hidden="true"><Ticket size={22} /></span>
  </header>

  <section class="picker-intro">
    <h1>Spin into your<br />lucky numbers.</h1>
    <p>Swipe a wheel up or down. The number in the centre becomes your choice.</p>
    {#if raffle}<div class="price-line"><strong>{formatEtb(raffle.ticketPrice)} <span>ETB / ticket</span></strong><span>Up to {raffle.maxTicketsPerUser} per person</span></div>{/if}
  </section>

  {#if resumePaymentId}
    <section class="resume-panel"><LockKeyhole size={20} /><div><h2>You have a checkout in progress</h2><p>Continue with your numbers, or cancel to release them and start fresh.</p><div class="resume-actions"><button on:click={resume} disabled={releasing}>Continue checkout <ArrowRight size={16} /></button><button on:click={releaseCheckout} disabled={releasing}>{releasing ? 'Releasing...' : 'Cancel & release numbers'}</button></div></div></section>
  {/if}

  <section class="selection-tools" aria-label="Find ticket numbers">
    <form class="number-search" on:submit|preventDefault={findNumber}>
      <Search size={19} aria-hidden="true" /><input aria-label="Find a ticket number" placeholder="Search 00001" inputmode="numeric" maxlength="10" bind:value={search} /><button type="submit" aria-label="Find and select number"><ArrowRight size={19} /></button>
    </form>
  </section>

  {#if error}<div class="picker-message error" role="alert"><CircleAlert size={18} /><div>{error}<button on:click={refresh} disabled={refreshing}>Refresh numbers</button></div></div>{/if}
  {#if notice}<p class="picker-notice" role="status">{notice}</p>{/if}
  {#if availability && !availability.salesOpen}<p class="picker-message">Ticket sales are not available for this raffle right now.</p>{:else if availability && allowance === 0 && !resumePaymentId}<p class="picker-message">You have reached your ticket allowance for this raffle. <a href="/tickets">View my tickets</a></p>{/if}

  <section class="numbers-section" aria-label="Available ticket numbers" aria-busy={refreshing}>
    <div class="grid-heading"><div><h2>Your ticket wheels</h2><p>Four choices together, with a fifth below.</p></div><button class="icon-button" on:click={refresh} disabled={refreshing} aria-label="Refresh availability"><RefreshCw size={17} class={refreshing ? 'spin' : ''} /></button></div>
    <div class="legend"><span><i class="available-dot"></i>Available</span><span><i class="selected-dot"><Check size={9} /></i>Chosen</span><span><i class="taken-dot"><X size={9} /></i>Taken</span></div>
    {#if loading}
      <div class="wheel-grid loading-wheels" aria-label="Loading ticket wheels">{#each Array(5) as _, index}<div class:fifth={index === 4}><span></span><div></div></div>{/each}</div>
    {:else if availability}
      <div class="wheel-grid">
        {#each Array(5) as _, slot}
          <div class:fifth={slot === 4} class:hidden-slot={slot >= allowance && wheelSlots[slot] === null}>
            <TicketNumberWheel
              {slot}
              rows={availability.numbers}
              value={wheelSlots[slot]}
              selectedNumbers={selected}
              disabled={purchasing || refreshing || !availability.salesOpen || (slot >= allowance && wheelSlots[slot] === null)}
              focusNumber={focusWheel === slot ? focusNumber : null}
              {focusNonce}
              on:change={setWheelSelection}
            />
          </div>
        {/each}
      </div>
      <p class="grid-note">Swipe slowly or flick to move faster. Taken numbers stay visible, and the wheel skips them when it settles.</p>
    {/if}
  </section>

  <footer class="selection-footer">
    <div class="selection-caption"><strong>Your selection</strong><span aria-live="polite">{selected.length} selected{availability ? ` · ${allowance} allowed` : ''}</span></div>
    <div class="selected-chips">{#if !selected.length}<span class="selection-placeholder">Spin a wheel or search for a number</span>{:else}{#each selected as n (n)}<button class:chip-conflict={conflicts.includes(n)} on:click={() => toggle(n)} disabled={purchasing} aria-label="Remove ticket {numberLabel(n)}">{numberLabel(n)}<X size={14} /></button>{/each}{/if}</div>
    <div class="footer-action"><div><span>Total</span><strong>{formatEtb(total)} <small>ETB</small></strong></div><button class="continue-button" on:click={continueToCheckout} disabled={!selected.length || selected.length > allowance || conflicts.length > 0 || purchasing || !availability?.salesOpen || !!resumePaymentId || !raffle}>{purchasing ? 'Reserving…' : 'Continue'}<ArrowRight size={19} /></button></div>
    <p><LockKeyhole size={12} /> Change your mind? Cancel checkout to release your numbers.</p>
  </footer>
</div>

<style>
  .number-picker { --picker-ink: #193c33; --picker-muted: #566960; --picker-border: #c8d6d0; color: var(--picker-ink); max-width: 560px; margin: -4px auto 0; padding-bottom: 250px; }
  :global(html:has(.number-picker)) { background: #f6f9f7; }
  :global(html:has(.number-picker) body) { background: #f6f9f7; }
  :global(html:has(.number-picker) .bottom-nav) { display: none; }
  :global(html:has(.number-picker) .native-bottom-nav-clearance) { padding-bottom: 0; }
  .picker-header { display: flex; align-items: center; gap: 12px; padding-bottom: 24px; }
  .picker-header > div { flex: 1; min-width: 0; } .picker-header p { font-size: 14px; font-weight: 700; overflow-wrap: anywhere; } .picker-header span { font-size: 12px; color: var(--picker-muted); }
  .icon-button { display: inline-flex; width: 44px; min-height: 44px; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; color: var(--picker-ink); }
  .picker-header .icon-button { background: white; border: 1px solid var(--picker-border); } .header-ticket { padding: 12px; }
  h1 { font-size: clamp(28px, 7.5vw, 36px); line-height: 1.17; font-weight: 800; letter-spacing: -.035em; } .picker-intro > p { font-size: 14px; line-height: 1.6; margin-top: 12px; color: var(--picker-muted); max-width: 300px; }
  .price-line { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 22px 0 24px; padding: 15px 0; border-block: 1px solid var(--picker-border); font-size: 12px; align-items: center; } .price-line strong { font-size: 19px; } .price-line strong span { font-size: 12px; font-weight: 500; } .price-line > span { color: var(--picker-muted); }
  .number-search { display: flex; gap: 10px; align-items: center; min-height: 52px; padding-left: 14px; border: 1px solid var(--picker-border); border-radius: 14px; background: white; } input { flex: 1; width: 0; min-width: 0; font: inherit; font-size: 16px; min-height: 48px; outline: none; caret-color: #08765a; } input::placeholder { color: var(--picker-muted); font-size: 14px; } .number-search button { width: 48px; min-height: 48px; display: grid; place-items: center; }
  .grid-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .grid-heading p { margin-top: 3px; color: var(--picker-muted); font-size: 11px; line-height: 1.45; } h2 { font-size: 16px; font-weight: 750; } .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; font-size: 11px; color: var(--picker-muted); } .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 12px; height: 12px; border-radius: 3px; display: grid; place-items: center; } .available-dot { background: white; border: 1px solid #778f84; } .selected-dot { background: #08765a; color: white; } .taken-dot { background: #f9e5e6; color: #a84b57; }
  .selection-tools { margin-bottom: 24px; }
  .resume-actions { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .resume-actions button:last-child { color: #85434a; }
  .wheel-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 7px; margin-top: 12px; }
  .wheel-grid > .fifth { grid-column: 2 / span 2; width: calc(50% - 4px); min-width: 78px; justify-self: center; }
  .wheel-grid > .hidden-slot { display: none; }
  .loading-wheels > div > span { display: block; width: 18px; height: 18px; margin: 5px 3px; border-radius: 50%; background: #e7eee9; }
  .loading-wheels > div > div { height: 210px; border-radius: 14px; background: linear-gradient(100deg, #e8efeb 20%, #f6f9f7 45%, #e8efeb 70%); background-size: 220% 100%; animation: wheel-loading 1.15s linear infinite; }
  @keyframes wheel-loading { to { background-position: -220% 0; } }
  .grid-note { font-size: 12px; line-height: 1.7; color: var(--picker-muted); margin: 20px 0; }
  .selection-footer { position: fixed; z-index: 25; bottom: 0; left: 0; right: 0; max-width: 592px; margin: auto; padding: 16px 20px max(16px, var(--safe-bottom), env(safe-area-inset-bottom)); background: #fff; box-shadow: 0 -6px 26px rgba(25,60,51,.08); } .selection-caption { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; } .selection-caption > span { color: var(--picker-muted); } .selected-chips { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; min-height: 48px; align-items: center; margin: 6px 0 10px; } .selected-chips button { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 3px; padding: 0 5px; min-height: 42px; border-radius: 10px; background: #e7f5ee; color: #064e3b; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; } .selected-chips button:nth-child(5) { grid-column: 2 / span 2; width: calc(50% - 3px); justify-self: center; } .selected-chips .chip-conflict { background: #fff0f1; color: #8d2136; } .selection-placeholder { grid-column: 1 / -1; color: var(--picker-muted); font-size: 12px; }
  .footer-action { display: flex; align-items: center; gap: 22px; } .footer-action > div { min-width: 85px; display: flex; flex-direction: column; gap: 2px; } .footer-action > div > span { font-size: 11px; color: var(--picker-muted); } .footer-action strong { font-size: 22px; font-variant-numeric: tabular-nums; } .footer-action small { font-size: 11px; font-weight: 500; } .continue-button { flex: 1; display: flex; gap: 12px; align-items: center; justify-content: center; min-height: 54px; border-radius: 14px; background: #193c33; color: white; font-size: 15px; font-weight: 700; } .selection-footer > p { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 10px; color: var(--picker-muted); line-height: 1.6; margin-top: 12px; }
  .picker-message, .resume-panel { display: flex; gap: 10px; padding: 16px; border-radius: 12px; background: #e0f1e9; margin: 16px 0; font-size: 13px; line-height: 1.6; } .resume-panel h2 { font-size: 14px; } .resume-panel p { margin-top: 4px; } .resume-panel button, .picker-message button { display: flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; } .error { background: #fff0f1; color: #8d2136; } .picker-notice { font-size: 13px; line-height: 1.6; padding-bottom: 12px; color: var(--picker-muted); }
  button:disabled { cursor: default; } .continue-button:disabled { background: #e4ebe7; color: #627168; } .icon-button:disabled { opacity: .45; } button:not(:disabled):active { transform: scale(.97); } button:focus-visible, a:focus-visible, .number-search:focus-within { outline: 2px solid #08765a; outline-offset: 3px; } ::selection { background: #b9ead5; color: #193c33; } :global(.spin) { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 359px) { .wheel-grid { column-gap: 4px; } .selection-footer { padding-inline: 16px; } }
  @media (prefers-reduced-motion: reduce) { .loading-wheels > div > div { animation: none; } :global(.spin) { animation: none; } button:not(:disabled):active { transform: none; } }
</style>
