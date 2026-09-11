<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import type { Raffle } from '$lib/stores/raffles.store.js';
  import { formatEtb } from '$lib/utils/currency.js';
  import { playSelectionSound } from '$lib/native/selectionSound.js';
  import { cancelPaymentAndReturnHome } from '$lib/native/browser.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { openCheckout, paymentReturnTarget } from '$lib/native/browser.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import TicketNumberWheel from '$lib/components/TicketNumberWheel.svelte';
  import IosSpinner from '$lib/components/IosSpinner.svelte';
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
  let wheelSlots: (number | null)[] = [null, null, null, null];
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
  let searchFocused = false;
  let searching = false;
  let searchFeedback = '';
  const numberLabel = (n: number) => String(n).padStart(5, '0');
  const canPick = (row: { number: number; state: NumberState }) => row.state === 'available' || selected.includes(row.number);
  $: digitLength = String(availability?.ticketCap ?? 99999).length;
  // All numbers up to the raffle's cap are already in memory (see the
  // pageSize=5000 fetch below) — autocomplete filters that client-side
  // list rather than round-tripping to the server on every keystroke. Any
  // digit sequence matches anywhere in the padded label (not just a
  // prefix) — typing "9" for ticket 23896 finds it just as "896" would.
  // Taken/held numbers are included too (not hidden) so the reason a
  // number can't be picked is visible right in the dropdown, instantly.
  $: suggestions = (() => {
    if (!availability || !searchFocused) return [];
    const query = search.replace(/\D/g, '');
    if (!query) return [];
    return availability.numbers
      .filter((row) => numberLabel(row.number).includes(query))
      .slice(0, 8);
  })();
  // Instant "already taken" / "doesn't exist" feedback the moment a full,
  // unambiguous ticket number has been typed — no need to press search.
  $: {
    const query = search.replace(/\D/g, '');
    if (!availability || query.length < digitLength) {
      searchFeedback = '';
    } else {
      const n = Number(query);
      const row = availability.numbers.find((item) => item.number === n);
      if (!row || n < 1 || n > availability.ticketCap) searchFeedback = $_('numbers.notExist');
      else if (!canPick(row)) searchFeedback = $_('numbers.occupied');
      else searchFeedback = '';
    }
  }
  $: allowance = availability?.allowance ?? 0;
  $: total = selected.length * Number(raffle?.ticketPrice ?? 0);
  $: wheelCount = Math.max(0, Math.min(4, raffle?.maxTicketsPerUser ?? 4, availability?.allowance ?? raffle?.maxTicketsPerUser ?? 4));

  function goBack() {
    hapticLight();
    navigateBack();
  }

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
      if (version === requestVersion) error = $_('numbers.refreshError');
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
      selected = [...new Set(draft.selectedNumbers.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
      wheelSlots = [...selected, ...Array(4 - selected.length).fill(null)];
      requestKey = draft.idempotencyKey ?? '';
    }
    api.get<{ raffle: Raffle }>(`/raffles/${$page.params.id}`, { skipAuth: true })
      .then((data) => { raffle = data.raffle; })
      .catch(() => { error = $_('numbers.loadRaffleError'); });
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
    else { notice = $_('numbers.allowanceNotice', { values: { allowance } }); return; }
    notice = '';
    hapticLight();
    playSelectionSound(selecting);
  }

  function setWheelSelection(event: CustomEvent<{ slot: number; number: number | null }>) {
    const { slot, number } = event.detail;
    if (slot >= allowance && wheelSlots[slot] === null) {
      notice = $_('numbers.allowanceNotice', { values: { allowance } });
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

  function selectFoundNumber(n: number) {
    if (!availability) return;
    const row = availability.numbers.find((item) => item.number === n);
    if (!row) {
      searchFeedback = $_('numbers.notExist');
      return;
    }
    if (!canPick(row)) {
      searchFeedback = $_('numbers.occupied');
      return;
    }
    searchFeedback = '';
    const existingSlot = wheelSlots.indexOf(n);
    const slot = existingSlot >= 0 ? existingSlot : wheelSlots.findIndex((number) => number === null);
    if (slot < 0 || (slot >= allowance && existingSlot < 0)) {
      notice = $_('numbers.allFilled', { values: { allowance } });
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
    notice = $_('numbers.selectedInChoice', { values: { number: numberLabel(n), slot: slot + 1 } });
  }

  async function findNumber() {
    if (!availability || searching) return;
    searching = true;
    // The lookup itself is instant (client-side), but a bare 0ms flash on
    // tap reads as "did that even register?" — this short, honest pause
    // gives the button real, visible feedback without adding noticeable
    // delay to the actual selection.
    await new Promise((resolve) => setTimeout(resolve, 220));
    try {
      const n = Number(search);
      if (!/^\d+$/.test(search.trim()) || !Number.isSafeInteger(n) || n < 1 || n > availability.ticketCap) {
        searchFeedback = $_('numbers.notExist');
        return;
      }
      selectFoundNumber(n);
    } finally {
      searching = false;
    }
  }

  function pickSuggestion(n: number) {
    selectFoundNumber(n);
    search = '';
    searchFocused = false;
  }

  // Strips anything that isn't a digit as the user types — pasted text,
  // stray letters from a hardware keyboard, etc. — so this field can only
  // ever hold a number, matching its numeric-only keyboard.
  function onSearchInput() {
    const digitsOnly = search.replace(/\D/g, '').slice(0, digitLength);
    if (digitsOnly !== search) search = digitsOnly;
  }

  async function releaseCheckout() {
    if (!resumePaymentId || releasing) return;
    releasing = true;
    await cancelPaymentAndReturnHome(resumePaymentId);
    selected = [];
    wheelSlots = [null, null, null, null];
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
          // body.error is server-generated English prose when present — not
          // translatable client-side without the API returning error codes
          // instead (a backend change, out of scope here). Only the
          // fallback (no server message) is a real translated string.
          error = body.error || $_('numbers.reserveError');
          conflicts = body.details?.numbers ?? [];
          resumePaymentId = body.details?.paymentId ?? resumePaymentId;
          if (conflicts.length) { requestKey = ''; saveDraft(); }
        } catch { error = $_('numbers.reserveError'); }
      } else error = $_('numbers.connectionInterrupted');
    } finally { purchasing = false; }
  }

  function resume() {
    if (resumePaymentId) goto(availability?.paymentStarted ? `/payments/${resumePaymentId}` : `/checkout?paymentId=${resumePaymentId}`);
  }
</script>

<svelte:head><title>{$_('numbers.pageTitle')}</title></svelte:head>

<div class="number-picker">
 <div class="picker-scroll">
  <header class="picker-header">
    <button type="button" class="icon-button" on:click={goBack} aria-label={$_('numbers.backAria')}><ArrowLeft size={21} /></button>
    <div><p>{raffle?.title ?? $_('numbers.defaultRaffleTitle')}</p><span>{$_('numbers.chooseTickets')}</span></div>
    <span class="header-ticket" aria-hidden="true"><Ticket size={22} /></span>
  </header>

  <section class="picker-intro">
    <h1>{@html $_('numbers.heading')}</h1>
    <p>{$_('numbers.subheading')}</p>
    {#if raffle}<div class="price-line"><strong>{formatEtb(raffle.ticketPrice)} <span>{$_('numbers.perTicket')}</span></strong><span>{$_('numbers.perPerson', { values: { n: raffle.maxTicketsPerUser } })}</span></div>{/if}
  </section>

  {#if resumePaymentId}
    <section class="resume-panel"><LockKeyhole size={20} /><div><h2>{$_('numbers.resumeTitle')}</h2><p>{$_('numbers.resumeBody')}</p><div class="resume-actions"><button on:click={resume} disabled={releasing}>{$_('numbers.continueCheckout')} <ArrowRight size={16} /></button><button on:click={releaseCheckout} disabled={releasing}>{releasing ? $_('numbers.releasing') : $_('numbers.cancelRelease')}</button></div></div></section>
  {/if}

  <section class="selection-tools" aria-label={$_('numbers.searchSectionAria')}>
    <form class="number-search" on:submit|preventDefault={findNumber}>
      <Search size={19} aria-hidden="true" /><input
        aria-label={$_('numbers.findInputAria')}
        placeholder={$_('numbers.placeholder')}
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        maxlength={digitLength}
        bind:value={search}
        on:input={onSearchInput}
        on:focus={() => (searchFocused = true)}
        on:blur={() => setTimeout(() => (searchFocused = false), 120)}
      /><button type="submit" aria-label={$_('numbers.findSubmitAria')} disabled={searching}>{#if searching}<IosSpinner size={16} color="#0a0a0a" />{:else}<ArrowRight size={19} />{/if}</button>
    </form>
    {#if searchFeedback}<p class="search-feedback" role="status">{searchFeedback}</p>{/if}
    {#if suggestions.length}
      <ul class="search-suggestions" role="listbox" aria-label={$_('numbers.suggestionsAria')}>
        {#each suggestions as row (row.number)}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={selected.includes(row.number)}
              aria-disabled={!canPick(row)}
              disabled={!canPick(row)}
              class:unavailable={!canPick(row)}
              on:click={() => pickSuggestion(row.number)}
            >
              <span>{numberLabel(row.number)}</span>
              {#if selected.includes(row.number)}<span class="suggestion-tag">{$_('numbers.selectedTag')}</span>
              {:else if row.state === 'owned' || row.state === 'held_by_you'}<span class="suggestion-tag yours">{$_('numbers.yoursTag')}</span>
              {:else if !canPick(row)}<span class="suggestion-tag taken">{$_('numbers.takenTag')}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if error}<div class="picker-message error" role="alert"><CircleAlert size={18} /><div>{error}<button on:click={refresh} disabled={refreshing}>{$_('numbers.refreshButton')}</button></div></div>{/if}
  {#if notice}<p class="picker-notice" role="status">{notice}</p>{/if}
  {#if availability && !availability.salesOpen}<p class="picker-message">{$_('numbers.salesClosed')}</p>{:else if availability && allowance === 0 && !resumePaymentId}<p class="picker-message">{$_('numbers.allowanceReached')} <a href="/tickets">{$_('numbers.viewMyTickets')}</a></p>{/if}

  <section class="numbers-section" aria-label={$_('numbers.gridSectionAria')} aria-busy={refreshing}>
    <div class="grid-heading"><div><h2>{$_('numbers.wheelsHeading')}</h2><p>{$_('numbers.wheelsSub')}</p></div><button class="icon-button" on:click={refresh} disabled={refreshing} aria-label={$_('numbers.refreshAria')}><RefreshCw size={17} class={refreshing ? 'spin' : ''} /></button></div>
    <div class="legend"><span><i class="available-dot"></i>{$_('numbers.legendAvailable')}</span><span><i class="selected-dot"><Check size={9} /></i>{$_('numbers.legendChosen')}</span><span><i class="taken-dot"><X size={9} /></i>{$_('numbers.legendTaken')}</span></div>
    {#if loading}
      <div class="wheel-grid wheels-{wheelCount || Math.min(4, raffle?.maxTicketsPerUser ?? 4)} loading-wheels" style:--wheel-count={wheelCount || Math.min(4, raffle?.maxTicketsPerUser ?? 4)} aria-label={$_('numbers.loadingWheelsAria')}>{#each Array(wheelCount || Math.min(4, raffle?.maxTicketsPerUser ?? 4)) as _}<div><span></span><div></div></div>{/each}</div>
    {:else if availability}
      <div class="wheel-grid wheels-{wheelCount}" style:--wheel-count={wheelCount}>
        {#each Array(wheelCount) as _, slot}
          <div>
            <TicketNumberWheel
              {slot}
              rows={availability.numbers}
              value={wheelSlots[slot]}
              selectedNumbers={selected}
              disabled={purchasing || refreshing || !availability.salesOpen}
              focusNumber={focusWheel === slot ? focusNumber : null}
              {focusNonce}
              on:change={setWheelSelection}
            />
          </div>
        {/each}
      </div>
      <p class="grid-note">{$_('numbers.gridNote')}</p>
    {/if}
  </section>
 </div>

  <footer class="selection-footer">
    <div class="selection-caption"><strong>{$_('numbers.yourSelection')}</strong><span aria-live="polite">{availability ? $_('numbers.selectedSummary', { values: { n: selected.length, allowed: allowance } }) : $_('numbers.selectedCountOnly', { values: { n: selected.length } })}</span></div>
    <div class="selected-chips">{#if !selected.length}<span class="selection-placeholder">{$_('numbers.chipsPlaceholder')}</span>{:else}{#each selected as n (n)}<button class:chip-conflict={conflicts.includes(n)} on:click={() => toggle(n)} disabled={purchasing} aria-label={$_('numbers.removeTicketAria', { values: { number: numberLabel(n) } })}>{numberLabel(n)}<X size={14} /></button>{/each}{/if}</div>
    <div class="footer-action"><div><span>{$_('numbers.total')}</span><strong>{formatEtb(total)} <small>ETB</small></strong></div><button class="continue-button" class:is-purchasing={purchasing} on:click={continueToCheckout} disabled={!selected.length || selected.length > allowance || conflicts.length > 0 || purchasing || !availability?.salesOpen || !!resumePaymentId || !raffle}>{purchasing ? $_('numbers.reserving') : $_('numbers.continue')}{#if purchasing}<IosSpinner size={18} color="#ffffff" />{:else}<ArrowRight size={19} />{/if}</button></div>
    <p><LockKeyhole size={12} /> {$_('numbers.changeMindNote')}</p>
  </footer>
</div>

<style>
  /* Pinned directly to the real viewport (position: fixed; inset: 0) rather
     than sized via calc(100dvh - <guessed offset>) against whatever the
     shared layout's <main> padding happens to be — that guess broke as
     soon as the actual top offset differed (e.g. the Telegram Mini App's
     much taller content-safe-area vs a plain phone's status bar), letting
     the whole page scroll again. Being fixed makes this page immune to the
     parent layout entirely: it always exactly fills the screen, so only
     .picker-scroll (never the page itself) can ever need to scroll. */
  .number-picker { --picker-ink: #0a0a0a; --picker-muted: #566960; --picker-border: #c8d6d0; position: fixed; inset: 0; z-index: 15; display: flex; flex-direction: column; overflow: hidden; background: #f6f9f7; padding-top: max(44px, var(--safe-top)); color: var(--picker-ink); }
  :global(html.telegram-mini-app) .number-picker { padding-top: var(--telegram-content-start); }
  .picker-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; max-width: 560px; width: 100%; margin: 0 auto; padding: 0 16px 250px; }
  :global(html:has(.number-picker)) { background: #f6f9f7; }
  :global(html:has(.number-picker) body) { background: #f6f9f7; }
  :global(html:has(.number-picker) .bottom-nav) { display: none; }
  :global(html:has(.number-picker) .native-bottom-nav-clearance) { padding-bottom: 0; }
  .picker-header { display: flex; align-items: center; gap: 12px; padding-bottom: 24px; }
  .picker-header > div { flex: 1; min-width: 0; } .picker-header p { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; } .picker-header span { font-size: 11px; color: var(--picker-muted); }
  .icon-button { display: inline-flex; width: 44px; min-height: 44px; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; color: var(--picker-ink); }
  .picker-header .icon-button { background: white; border: 1px solid var(--picker-border); } .header-ticket { padding: 12px; }
  h1 { font-size: clamp(19px, 5vw, 22px); line-height: 1.25; font-weight: 800; letter-spacing: -.03em; } .picker-intro > p { font-size: 13px; line-height: 1.6; margin-top: 12px; color: var(--picker-muted); max-width: 300px; }
  .price-line { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 22px 0 24px; padding: 15px 0; border-block: 1px solid var(--picker-border); font-size: 11px; align-items: center; } .price-line strong { font-size: 17px; } .price-line strong span { font-size: 11px; font-weight: 500; } .price-line > span { color: var(--picker-muted); }
  .number-search { display: flex; gap: 10px; align-items: center; min-height: 52px; padding-left: 14px; border: 1px solid var(--picker-border); border-radius: 14px; background: white; } input { flex: 1; width: 0; min-width: 0; font: inherit; font-size: 16px; min-height: 48px; outline: none; caret-color: #08765a; } input::placeholder { color: var(--picker-muted); font-size: 14px; } .number-search button { width: 48px; min-height: 48px; display: grid; place-items: center; }
  .grid-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .grid-heading p { margin-top: 3px; color: var(--picker-muted); font-size: 10px; line-height: 1.45; } h2 { font-size: 15px; font-weight: 750; } .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; font-size: 10px; color: var(--picker-muted); } .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 12px; height: 12px; border-radius: 3px; display: grid; place-items: center; } .available-dot { background: white; border: 1px solid #778f84; } .selected-dot { background: #08765a; color: white; } .taken-dot { background: #f9e5e6; color: #a84b57; }
  .selection-tools { position: relative; margin-bottom: 24px; }
  .search-feedback { margin-top: 7px; font-size: 11px; font-weight: 650; color: #a84b57; }
  .search-suggestions { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; right: 0; max-height: min(300px, 38vh); overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; background: #fff; border: 1px solid var(--picker-border); border-radius: 14px; box-shadow: 0 14px 34px -12px rgba(25,60,51,.28); padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .search-suggestions button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; padding: 0 12px; border-radius: 10px; font-variant-numeric: tabular-nums; font-weight: 650; font-size: 13px; }
  .search-suggestions button:not(:disabled):active { background: #eef5f0; }
  .search-suggestions button.unavailable { color: var(--picker-muted); text-decoration: line-through; opacity: .7; cursor: default; }
  .suggestion-tag { font-size: 10px; font-weight: 700; color: #08765a; background: #d4f4e6; padding: 2px 7px; border-radius: 999px; }
  .suggestion-tag.taken { color: #a84b57; background: #f9e5e6; }
  .suggestion-tag.yours { color: #08765a; background: #d4f4e6; }
  .resume-actions { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .resume-actions button:last-child { color: #85434a; }
  .wheel-grid { display: grid; grid-template-columns: repeat(var(--wheel-count), minmax(0, 1fr)); gap: 7px; width: 100%; margin: 12px auto 0; }
  .wheel-grid.wheels-1 { max-width: 96px; }
  .wheel-grid.wheels-2 { max-width: 199px; }
  .wheel-grid.wheels-3 { max-width: 302px; }
  .loading-wheels > div > span { display: block; width: 18px; height: 18px; margin: 5px 3px; border-radius: 50%; background: #e7eee9; }
  .loading-wheels > div > div { height: 210px; border-radius: 14px; background: linear-gradient(100deg, #e8efeb 20%, #f6f9f7 45%, #e8efeb 70%); background-size: 220% 100%; animation: wheel-loading 1.15s linear infinite; }
  @keyframes wheel-loading { to { background-position: -220% 0; } }
  .grid-note { font-size: 11px; line-height: 1.7; color: var(--picker-muted); margin: 20px 0; }
  .selection-footer { position: fixed; z-index: 25; bottom: 0; left: 0; right: 0; max-width: 592px; margin: auto; padding: 16px 20px max(16px, var(--safe-bottom), env(safe-area-inset-bottom)); background: #fff; box-shadow: 0 -6px 26px rgba(25,60,51,.08); } .selection-caption { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; } .selection-caption > span { color: var(--picker-muted); } .selected-chips { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; min-height: 48px; align-items: center; margin: 6px 0 10px; } .selected-chips button { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 3px; padding: 0 5px; min-height: 42px; border-radius: 10px; background: #e7f5ee; color: #064e3b; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; } .selected-chips .chip-conflict { background: #fff0f1; color: #8d2136; } .selection-placeholder { grid-column: 1 / -1; color: var(--picker-muted); font-size: 11px; }
  .footer-action { display: flex; align-items: center; gap: 22px; } .footer-action > div { min-width: 85px; display: flex; flex-direction: column; gap: 2px; } .footer-action > div > span { font-size: 10px; color: var(--picker-muted); } .footer-action strong { font-size: 20px; font-variant-numeric: tabular-nums; } .footer-action small { font-size: 10px; font-weight: 500; } .continue-button { flex: 1; display: flex; gap: 12px; align-items: center; justify-content: center; min-height: 54px; border-radius: 14px; background: #193c33; color: white; font-size: 14px; font-weight: 700; } .selection-footer > p { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 10px; color: var(--picker-muted); line-height: 1.6; margin-top: 12px; }
  .picker-message, .resume-panel { display: flex; gap: 10px; padding: 16px; border-radius: 12px; background: #e0f1e9; margin: 16px 0; font-size: 12px; line-height: 1.6; } .resume-panel h2 { font-size: 13px; } .resume-panel p { margin-top: 4px; } .resume-panel button, .picker-message button { display: flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; } .error { background: #fff0f1; color: #8d2136; } .picker-notice { font-size: 12px; line-height: 1.6; padding-bottom: 12px; color: var(--picker-muted); }
  button:disabled { cursor: default; } .continue-button:disabled { background: #e4ebe7; color: #627168; } .continue-button.is-purchasing:disabled { background: #193c33; color: white; } .icon-button:disabled { opacity: .45; } button:not(:disabled):active { transform: scale(.97); } button:focus-visible, a:focus-visible, .number-search:focus-within { outline: 2px solid #08765a; outline-offset: 3px; } ::selection { background: #b9ead5; color: var(--picker-ink); } :global(.spin) { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 359px) { .wheel-grid { column-gap: 4px; } .selection-footer { padding-inline: 16px; } }
  @media (prefers-reduced-motion: reduce) { .loading-wheels > div > div { animation: none; } :global(.spin) { animation: none; } button:not(:disabled):active { transform: none; } }
</style>
