<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import type { Raffle } from '$lib/stores/raffles.store.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { playPaginationSound } from '$lib/native/paginationSound.js';
  import { playSelectionSound } from '$lib/native/selectionSound.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { openCheckout, paymentReturnTarget } from '$lib/native/browser.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert, LockKeyhole, RefreshCw, Search, Ticket, X } from 'lucide-svelte';

  type NumberState = 'available' | 'sold' | 'owned' | 'held' | 'held_by_you';
  type Availability = {
    numbers: { number: number; state: NumberState }[];
    start: number; end: number; ticketCap: number; allowance: number; owned: number;
    activePaymentId: string | null; paymentStarted: boolean; salesOpen: boolean;
  };
  const pullRefresh = getPullRefreshContext();
  const pageSize = 60;
  let raffle: Raffle | null = null;
  let availability: Availability | null = null;
  let selected: number[] = [];
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
  let justToggled: Set<number> = new Set();
  let resumePaymentId: string | null = null;
  let requestVersion = 0;
  const numberLabel = (n: number) => String(n).padStart(5, '0');
  $: allowance = availability?.allowance ?? 0;
  $: total = selected.length * Number(raffle?.ticketPrice ?? 0);
  $: currentPage = Math.floor(((availability?.start ?? 1) - 1) / pageSize) + 1;
  $: pageCount = Math.ceil((availability?.ticketCap ?? 1) / pageSize);

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
    if (selected.includes(n)) { selected = selected.filter((value) => value !== n); selecting = false; }
    else if (selected.length < allowance) { selected = [...selected, n].sort((a, b) => a - b); selecting = true; }
    else { notice = `You can choose ${allowance} ticket${allowance === 1 ? '' : 's'} for this raffle.`; return; }
    requestKey = '';
    conflicts = conflicts.filter((value) => value !== n);
    notice = '';
    hapticLight();
    playSelectionSound(selecting);
    justToggled = new Set(justToggled).add(n);
    setTimeout(() => { justToggled.delete(n); justToggled = justToggled; }, 180);
    saveDraft();
  }

  function findNumber() {
    if (!availability) return;
    const n = Number(search);
    if (!/^\d+$/.test(search.trim()) || !Number.isSafeInteger(n) || n < 1 || n > availability.ticketCap) {
      notice = `Enter a number from 00001 to ${numberLabel(availability.ticketCap)}.`;
      return;
    }
    start = Math.floor((n - 1) / pageSize) * pageSize + 1;
    notice = `Showing the range containing ${numberLabel(n)}.`;
    refresh();
  }

  function changePage(direction: -1 | 1) {
    if (!availability || refreshing || purchasing) return;
    const nextStart = availability.start + direction * pageSize;
    if (nextStart < 1 || nextStart > availability.ticketCap) return;
    start = nextStart;
    playPaginationSound();
    hapticLight();
    refresh();
  }

  async function releaseCheckout() {
    if (!resumePaymentId || releasing) return;
    releasing = true;
    await cancelPaymentAndReturnHome(resumePaymentId);
    selected = [];
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
    <h1>Choose your<br />lucky numbers.</h1>
    <p>A favourite date? A number you love? Tap to make it yours.</p>
    {#if raffle}<div class="price-line"><strong>{formatEtb(raffle.ticketPrice)} <span>ETB / ticket</span></strong><span>Up to {raffle.maxTicketsPerUser} per person</span></div>{/if}
  </section>

  {#if resumePaymentId}
    <section class="resume-panel"><LockKeyhole size={20} /><div><h2>You have a checkout in progress</h2><p>Continue with your numbers, or cancel to release them and start fresh.</p><div class="resume-actions"><button on:click={resume} disabled={releasing}>Continue checkout <ArrowRight size={16} /></button><button on:click={releaseCheckout} disabled={releasing}>{releasing ? 'Releasing...' : 'Cancel & release numbers'}</button></div></div></section>
  {/if}

  <section class="selection-tools" aria-label="Find ticket numbers">
    <form class="number-search" on:submit|preventDefault={findNumber}>
      <Search size={19} aria-hidden="true" /><input aria-label="Find a ticket number" placeholder="Find your lucky number" inputmode="numeric" maxlength="10" bind:value={search} /><button type="submit" aria-label="Find number"><ArrowRight size={19} /></button>
    </form>
  </section>

  {#if error}<div class="picker-message error" role="alert"><CircleAlert size={18} /><div>{error}<button on:click={refresh} disabled={refreshing}>Refresh numbers</button></div></div>{/if}
  {#if notice}<p class="picker-notice" role="status">{notice}</p>{/if}
  {#if availability && !availability.salesOpen}<p class="picker-message">Ticket sales are not available for this raffle right now.</p>{:else if availability && allowance === 0 && !resumePaymentId}<p class="picker-message">You have reached your ticket allowance for this raffle. <a href="/tickets">View my tickets</a></p>{/if}

  <section class="numbers-section" aria-label="Available ticket numbers" aria-busy={refreshing}>
    <div class="grid-heading"><h2>Find your favourites</h2><button class="icon-button" on:click={refresh} disabled={refreshing} aria-label="Refresh availability"><RefreshCw size={17} class={refreshing ? 'spin' : ''} /></button></div>
    <div class="legend"><span><i class="available-dot"></i>Available</span><span><i class="selected-dot"><Check size={9} /></i>Selected</span><span><i class="taken-dot"><X size={9} /></i>Unavailable</span></div>
    {#if loading}
      <div class="number-grid" aria-label="Loading numbers">{#each Array(20) as _}<div class="number-skeleton"></div>{/each}</div>
    {:else if availability}
      <nav class="range-navigation" aria-label="Ticket number pages">
        <button class="page-button" disabled={currentPage <= 1 || refreshing || purchasing} aria-label="Previous numbers" on:click={() => changePage(-1)}><ChevronLeft size={17} /><span>Back</span></button>
        <span class="page-position" aria-live="polite">Page <strong>{currentPage}</strong> of {pageCount}</span>
        <button class="page-button" disabled={currentPage >= pageCount || refreshing || purchasing} aria-label="Next numbers" on:click={() => changePage(1)}><span>Next</span><ChevronRight size={17} /></button>
      </nav>
      <p class="range-caption">{numberLabel(availability.start)} – {numberLabel(availability.end)}</p>
      <div class="number-grid">
        {#each availability.numbers as row (row.number)}
          {@const isSelected = selected.includes(row.number)}
          <button class="number-tile" class:selected={isSelected} class:pop={justToggled.has(row.number)} class:unavailable={row.state !== 'available'} class:matched={search.trim() !== '' && Number(search) === row.number} class:conflict={conflicts.includes(row.number)}
            aria-label="Ticket {numberLabel(row.number)}, {conflicts.includes(row.number) ? 'no longer available' : isSelected ? 'selected' : row.state.replaceAll('_', ' ')}"
            aria-pressed={isSelected} disabled={purchasing || (!isSelected && (row.state !== 'available' || !availability.salesOpen || selected.length >= allowance))}
            on:click={() => toggle(row.number)}>
            <span class="tile-corner" class:checked={isSelected && !conflicts.includes(row.number)} class:taken={row.state !== 'available' && row.state !== 'owned' && row.state !== 'held_by_you'} aria-hidden="true">
              {#if conflicts.includes(row.number) || row.state === 'sold' || row.state === 'held'}<X size={11} strokeWidth={2.5} />{:else if isSelected || row.state === 'owned' || row.state === 'held_by_you'}<Check size={11} strokeWidth={3} />{/if}
            </span>
            <span>{numberLabel(row.number)}</span>
            {#if row.state === 'owned'}<span class="tile-state">Yours</span>{:else if row.state === 'held_by_you'}<span class="tile-state">Your hold</span>{:else if row.state !== 'available'}<span class="tile-state">{row.state === 'held' ? 'Held' : 'Taken'}</span>{/if}
          </button>
        {/each}
      </div>
      <p class="grid-note">Numbers belong to this raffle only. Each confirmed ticket has an equal chance in its eligible draw.</p>
    {/if}
  </section>

  <footer class="selection-footer">
    <div class="selection-caption"><strong>Your selection</strong><span aria-live="polite">{selected.length} selected{availability ? ` · ${allowance} allowed` : ''}</span></div>
    <div class="selected-chips">{#if !selected.length}<span class="selection-placeholder">Tap a number above to get started</span>{:else}{#each selected as n (n)}<button class:chip-conflict={conflicts.includes(n)} on:click={() => toggle(n)} disabled={purchasing} aria-label="Remove ticket {numberLabel(n)}">{numberLabel(n)}<X size={14} /></button>{/each}{/if}</div>
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
  .grid-heading { display: flex; justify-content: space-between; align-items: center; } h2 { font-size: 16px; font-weight: 750; } .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11px; color: var(--picker-muted); } .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 12px; height: 12px; border-radius: 3px; display: grid; place-items: center; } .available-dot { background: white; border: 1px solid #778f84; } .selected-dot { background: #08765a; color: white; } .taken-dot { background: #f9e5e6; color: #a84b57; }
  .selection-tools { margin-bottom: 24px; }
  .range-navigation { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 20px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .page-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; padding: 0 10px; border-radius: 10px; background: #e9f0eb; font-size: 12px; font-weight: 650; }
  .page-button:not(:disabled):hover { background: #dbeade; }
  .page-position { color: var(--picker-muted); white-space: nowrap; }
  .page-position strong { color: var(--picker-ink); font-weight: 700; }
  .range-caption { text-align: center; color: var(--picker-muted); font-size: 11px; font-variant-numeric: tabular-nums; margin: 10px 0 12px; }
  .resume-actions { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .resume-actions button:last-child { color: #85434a; }
  .tile-corner { position: absolute; right: 5px; top: 5px; width: 14px; height: 14px; border: 1px solid #9aaea2; border-radius: 4px; display: grid; place-items: center; color: #31604c; background: transparent; transition: background-color 160ms ease, border-color 160ms ease; }
  .tile-corner.checked { color: white; background: #08765a; border-color: #08765a; }
  .tile-corner.checked :global(svg) { animation: check-in 220ms cubic-bezier(.16, 1, .3, 1); }
  .tile-corner.taken { border-color: transparent; background: #f9e5e6; color: #a84b57; }
  @keyframes check-in { from { transform: scale(.55); opacity: .2; } to { transform: scale(1); opacity: 1; } }

  .number-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
  .number-tile, .number-skeleton { min-height: 56px; min-width: 48px; border-radius: 12px; } .number-tile { position: relative; display: flex; flex-direction: column; gap: 1px; justify-content: center; align-items: center; border: 1px solid #aebfb6; background: white; color: var(--picker-ink); font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; transition: background-color 150ms ease-out, border-color 150ms ease-out, transform 150ms ease-out; } .number-tile.selected { background: #d4f4e6; border-color: #08765a; color: #064e3b; } .number-tile.unavailable:not(.selected) { background: #f0f1ee; color: #626d65; border-color: transparent; } .tile-state { font-size: 9px; font-weight: 500; } .number-tile.matched { outline: 2px solid #193c33; outline-offset: 2px; } .number-tile.conflict { border-color: #a62940; background: #fff0f1; color: #8d2136; } .number-skeleton { background: #e6eee9; }
  .number-tile.pop { animation: tile-pop 180ms cubic-bezier(.16, 1, .3, 1); }
  @keyframes tile-pop { 0% { transform: scale(1); } 40% { transform: scale(1.08); } 100% { transform: scale(1); } }
  .grid-note { font-size: 12px; line-height: 1.7; color: var(--picker-muted); margin: 20px 0; }
  .selection-footer { position: fixed; z-index: 25; bottom: 0; left: 0; right: 0; max-width: 592px; margin: auto; padding: 16px 20px max(16px, var(--safe-bottom), env(safe-area-inset-bottom)); background: #fff; box-shadow: 0 -6px 26px rgba(25,60,51,.08); } .selection-caption { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; } .selection-caption > span { color: var(--picker-muted); } .selected-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 48px; align-items: center; margin: 6px 0 10px; } .selected-chips button { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 9px; min-height: 44px; border-radius: 10px; background: #e7f5ee; color: #064e3b; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; } .selected-chips .chip-conflict { background: #fff0f1; color: #8d2136; } .selection-placeholder { color: var(--picker-muted); font-size: 12px; }
  .footer-action { display: flex; align-items: center; gap: 22px; } .footer-action > div { min-width: 85px; display: flex; flex-direction: column; gap: 2px; } .footer-action > div > span { font-size: 11px; color: var(--picker-muted); } .footer-action strong { font-size: 22px; font-variant-numeric: tabular-nums; } .footer-action small { font-size: 11px; font-weight: 500; } .continue-button { flex: 1; display: flex; gap: 12px; align-items: center; justify-content: center; min-height: 54px; border-radius: 14px; background: #193c33; color: white; font-size: 15px; font-weight: 700; } .selection-footer > p { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 10px; color: var(--picker-muted); line-height: 1.6; margin-top: 12px; }
  .picker-message, .resume-panel { display: flex; gap: 10px; padding: 16px; border-radius: 12px; background: #e0f1e9; margin: 16px 0; font-size: 13px; line-height: 1.6; } .resume-panel h2 { font-size: 14px; } .resume-panel p { margin-top: 4px; } .resume-panel button, .picker-message button { display: flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; } .error { background: #fff0f1; color: #8d2136; } .picker-notice { font-size: 13px; line-height: 1.6; padding-bottom: 12px; color: var(--picker-muted); }
  button:disabled { cursor: default; } .continue-button:disabled { background: #e4ebe7; color: #627168; } .icon-button:disabled, .page-button:disabled { opacity: .45; } button:not(:disabled):active { transform: scale(.97); } button:focus-visible, a:focus-visible, .number-search:focus-within { outline: 2px solid #08765a; outline-offset: 3px; } ::selection { background: #b9ead5; color: #193c33; } :global(.spin) { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 359px) { .number-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .selection-footer { padding-inline: 16px; } }
  @media (prefers-reduced-motion: reduce) { .number-tile, .tile-corner { transition: none; } .number-tile.pop { animation: none; } .tile-corner.checked :global(svg) { animation: none; } :global(.spin) { animation: none; } button:not(:disabled):active { transform: none; } }
</style>
