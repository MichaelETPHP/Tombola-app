<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
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
  import { openCheckout, paymentReturnTarget } from '$lib/native/browser.js';
  import { getPendingPurchase, setPendingPurchase, clearPendingPurchase } from '$lib/stores/pendingPurchase.js';
  import TicketNumberGrid from '$lib/components/TicketNumberGrid.svelte';
  import IosSpinner from '$lib/components/IosSpinner.svelte';
  import { ArrowRight, Check, CircleAlert, LockKeyhole, RefreshCw, Ticket, X } from 'lucide-svelte';

  export let raffle: Raffle;

  type NumberState = 'available' | 'sold' | 'owned' | 'held' | 'held_by_you';
  type Availability = {
    numbers: { number: number; state: NumberState; displayNumber: string }[];
    start: number; end: number; ticketCap: number; allowance: number; owned: number;
    activePaymentId: string | null; paymentStarted: boolean; salesOpen: boolean;
  };
  // The server always renders a fixed 6-digit display number (see
  // api/lib/ticket-display-number.ts) — scrambled and globally unique
  // across every raffle on the platform, not just this one. Always exactly
  // 6 digits, which is what "how many digits before treating this as one
  // specific ticket" needs to key off — not ticketCap, since a scrambled
  // number for a 50-ticket raffle can still be anywhere in the full
  // 6-digit range (this raffle's own reserved slice of it).
  const DISPLAY_DIGIT_LENGTH = 6;
  const pageSize = 5000;
  let availability: Availability | null = null;
  let selected: number[] = [];
  // Reserves exactly enough room below the grid for the sticky footer
  // below to rest on once it appears, instead of parking on top of the
  // grid's own last row. Without this, position:sticky only ever pulls
  // the footer down to its stuck offset — it never pushes the content
  // above it out of the way itself, so the last row stayed covered no
  // matter how far down you scrolled.
  let footerHeight = 0;
  let start = 1;
  let error = '';
  let notice = '';
  // True only for the "you're at your ticket limit" warning — everything
  // else `notice` shows (a search pick's confirmation, etc.) is routine
  // status, not a stop-and-look alert.
  let noticeIsWarning = false;
  let loading = true;
  let refreshing = false;
  let purchasing = false;
  let releasing = false;
  let requestKey = '';
  let conflicts: number[] = [];
  let resumePaymentId: string | null = null;
  // Payment ids already confirmed against Chapa this session — re-verifying
  // on every 15s poll would waste the endpoint's rate limit for no reason
  // once we already know the true status.
  const verifiedPaymentIds = new Set<string>();
  let requestVersion = 0;
  // The server is the only source of truth for what a ticket number looks
  // like (see Availability.displayNumber above) — this is a pure lookup,
  // never a computation, so it can't drift from whatever scramble the
  // server actually applied. Falls back to plain zero-padding only for a
  // number this page hasn't loaded availability for yet.
  $: displayNumberByInternal = new Map((availability?.numbers ?? []).map((r) => [r.number, r.displayNumber]));
  $: numberLabel = (n: number) => displayNumberByInternal.get(n) ?? String(n).padStart(DISPLAY_DIGIT_LENGTH, '0');
  $: allowance = availability?.allowance ?? 0;
  $: total = selected.length * Number(raffle?.ticketPrice ?? 0);

  function saveDraft() {
    if (!$page.params.id) return;
    setPendingPurchase({ raffleId: $page.params.id, quantity: selected.length, selectedNumbers: selected, idempotencyKey: requestKey });
  }

  let manualRefreshing = false;

  async function refresh() {
    const version = ++requestVersion;
    refreshing = true;
    try {
      const path = $auth.isAuthenticated ? 'ticket-availability' : 'public-ticket-availability';
      const data = await api.get<Availability>(`/raffles/${$page.params.id}/${path}?start=${start}&limit=${pageSize}`, { skipAuth: !$auth.isAuthenticated });
      if (version !== requestVersion) return;
      availability = data;
      conflicts = selected.filter((n) => data.numbers.some((row) => row.number === n && row.state !== 'available'));
      error = '';

      const activeId = data.activePaymentId;
      if (activeId && !verifiedPaymentIds.has(activeId)) {
        // Don't trust a "pending" checkout we haven't personally confirmed
        // yet — a USSD decline on Chapa's side doesn't always reach us via
        // webhook right away, so our own status can lag reality by minutes.
        // Hide the resume prompt until a fresh check comes back, instead of
        // risking "Continue checkout" on a payment that's secretly already
        // dead. void, not awaited: refresh() itself shouldn't stall on this.
        resumePaymentId = null;
        void verifyResumable(activeId);
      } else {
        resumePaymentId = activeId;
      }
    } catch {
      if (version === requestVersion) error = $_('numbers.refreshError');
    } finally {
      if (version === requestVersion) { refreshing = false; loading = false; }
    }
  }

  /**
   * Asks Chapa directly whether a "pending" checkout is actually still
   * alive, rather than trusting our own possibly-stale status. If it's
   * already failed/cancelled, this call itself is what triggers the
   * numbers being released server-side (see api's transitionPendingPayment)
   * — refreshing afterwards just picks up that already-clean state, so the
   * user lands straight on a normal, ready-to-pick grid with no manual
   * "Cancel & release" tap required.
   */
  async function verifyResumable(id: string) {
    try {
      const { payment } = await api.post<{ payment: { status: string } }>(`/payments/${id}/verify`);
      verifiedPaymentIds.add(id);
      if (payment.status === 'pending') {
        resumePaymentId = id;
      } else if (payment.status === 'completed' || payment.status === 'review') {
        // Rare — a delayed webhook, not a real stuck reservation. The
        // receipt page already knows how to show either outcome correctly.
        await goto(`/payments/${id}`);
      } else {
        await refresh();
      }
    } catch {
      // Verification itself failed (network blip, rate limit) — fall back
      // to trusting our own last-known status rather than blocking the
      // user indefinitely on neither state.
      verifiedPaymentIds.add(id);
      resumePaymentId = id;
    }
  }

  // Explicit tap on the number-grid refresh button — shows the skeleton
  // (unlike the silent background refresh below) so the tap clearly did
  // something. Never runs once tickets are picked: reloading `availability`
  // mid-choice re-renders the grid with a new `rows` array reference, which
  // is exactly the kind of surprise reflow/scroll jump that shouldn't
  // happen while someone is mid-decision.
  async function manualRefresh() {
    if (selected.length) return;
    manualRefreshing = true;
    try {
      await refresh();
    } finally {
      manualRefreshing = false;
    }
  }

  onMount(() => {
    const draft = getPendingPurchase();
    if (draft && draft.raffleId === $page.params.id && Array.isArray(draft.selectedNumbers)) {
      selected = [...new Set(draft.selectedNumbers.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
      requestKey = draft.idempotencyKey ?? '';
    }
    void refresh().then(() => {
      if ($auth.isAuthenticated && selected.length && $page.url.searchParams.get('resumeCheckout') === '1') {
        void continueToCheckout();
      }
    });
    // No pullRefresh.set() here, deliberately: this page is a fixed
    // full-screen overlay (see .number-picker below) with its own internal
    // scroller, so the *document* is always sitting at scrollTop 0 no
    // matter where the picker/grid content is scrolled to. PullToRefresh's
    // "are we at the top" check reads exactly that document scrollTop, so
    // it can never tell "user is at the top of the picker" apart from
    // "user is swiping inside the number grid" — every downward swipe
    // inside the grid was being read as a pull-to-refresh gesture. The
    // manual refresh button next to the number grid below covers the same
    // need safely.
    // Never runs while a selection is in progress — same reasoning as
    // manualRefresh() above, just for the automatic/background triggers.
    const foreground = () => { if (!document.hidden && !purchasing && !selected.length) refresh(); };
    const timer = setInterval(foreground, 15000);
    document.addEventListener('visibilitychange', foreground);
    return () => { requestVersion++; clearInterval(timer); document.removeEventListener('visibilitychange', foreground); };
  });

  function toggle(n: number) {
    if (purchasing) return;
    let selecting: boolean;
    if (selected.includes(n)) {
      selected = selected.filter((number) => number !== n);
      selecting = false;
    } else if (selected.length < allowance) {
      selected = [...selected, n];
      selecting = true;
    } else {
      // Same wording/urgency as the search flow's over-limit case below —
      // one consistent "you're at your max" warning regardless of which
      // path (tap or search) triggered it.
      notice = $_('numbers.allFilled', { values: { allowance } });
      noticeIsWarning = true;
      return;
    }
    requestKey = '';
    conflicts = conflicts.filter((number) => selected.includes(number));
    saveDraft();
    notice = '';
    noticeIsWarning = false;
    hapticLight();
    playSelectionSound(selecting);
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
    if (!$auth.isAuthenticated) {
      saveDraft();
      const returnTo = `/raffles/${raffle.id}?resumeCheckout=1`;
      await goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
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

<div class="number-picker" data-no-pull-refresh>
  {#if resumePaymentId}
    <section class="resume-panel"><LockKeyhole size={20} /><div><h2>{$_('numbers.resumeTitle')}</h2><p>{$_('numbers.resumeBody')}</p><div class="resume-actions"><button on:click={resume} disabled={releasing}>{$_('numbers.continueCheckout')} <ArrowRight size={16} /></button><button on:click={releaseCheckout} disabled={releasing}>{releasing ? $_('numbers.releasing') : $_('numbers.cancelRelease')}</button></div></div></section>
  {/if}

  {#if error}<div class="picker-message error" role="alert"><CircleAlert size={18} /><div>{error}<button on:click={refresh} disabled={refreshing}>{$_('numbers.refreshButton')}</button></div></div>{/if}
  {#if notice && noticeIsWarning}
    <p class="picker-notice notice-warning" role="alert" transition:scale={{ duration: 160, start: 0.95, easing: cubicOut }}><CircleAlert size={14} />{notice}</p>
  {:else if notice}
    <p class="picker-notice" role="status">{notice}</p>
  {/if}
  {#if availability && !availability.salesOpen}<p class="picker-message">{$_('numbers.salesClosed')}</p>{:else if availability && allowance === 0 && !resumePaymentId}<div class="picker-message allowance-limit" role="alert"><CircleAlert size={18} /><div><p class="allowance-limit-text">{$_('numbers.allowanceReached')}</p><a href="/tickets" class="allowance-limit-cta"><Ticket size={14} />{$_('numbers.viewMyTickets')}<ArrowRight size={14} /></a></div></div>{/if}

  <section
    class="numbers-section"
    aria-label={$_('numbers.gridSectionAria')}
    aria-busy={refreshing}
    style={selected.length ? `padding-bottom: ${footerHeight}px` : ''}
  >
    <div class="grid-heading"><h2>{$_('numbers.wheelsHeading')}</h2><button class="icon-button icon-button-labeled" on:click={manualRefresh} disabled={refreshing || !!selected.length} aria-label={$_('numbers.refreshAria')}><RefreshCw size={15} class={manualRefreshing ? 'spin' : ''} />{$_('numbers.refreshLabel')}</button></div>
    <div class="legend"><span><i class="available-dot"></i>{$_('numbers.legendAvailable')}</span><span><i class="selected-dot"><Check size={9} /></i>{$_('numbers.legendChosen')}</span><span><i class="taken-dot"><X size={9} /></i>{$_('numbers.legendTaken')}</span></div>
    {#if loading || manualRefreshing}
      <div class="grid-skeleton" aria-label={$_('numbers.loadingWheelsAria')}></div>
    {:else if availability}
      <TicketNumberGrid
        rows={availability.numbers}
        selectedNumbers={selected}
        disabled={purchasing || refreshing || !availability.salesOpen}
        onToggle={toggle}
      />
      <p class="grid-note">{$_('numbers.gridNote')}</p>
    {/if}
  </section>
  {#if selected.length}
  <footer class="selection-footer" bind:clientHeight={footerHeight}>
    <div class="selection-caption">
      <div class="selection-caption-row"><strong>{$_('numbers.yourSelection')}</strong><span aria-live="polite">{availability ? $_('numbers.selectedSummary', { values: { n: selected.length, allowed: allowance } }) : $_('numbers.selectedCountOnly', { values: { n: selected.length } })}</span></div>
    </div>
    <div class="selected-chips">{#each selected as n (n)}<button class:chip-conflict={conflicts.includes(n)} on:click={() => toggle(n)} disabled={purchasing} aria-label={$_('numbers.removeTicketAria', { values: { number: numberLabel(n) } })}>{numberLabel(n)}<X size={14} /></button>{/each}</div>
    <div class="footer-action"><div><span>{$_('numbers.total')}</span><strong>{formatEtb(total)} <small>ETB</small></strong></div><button class="continue-button" class:is-purchasing={purchasing} on:click={continueToCheckout} disabled={!selected.length || selected.length > allowance || conflicts.length > 0 || purchasing || !availability?.salesOpen || !!resumePaymentId || !raffle}>{purchasing ? $_('numbers.reserving') : $_('numbers.continue')}{#if purchasing}<IosSpinner size={16} color="#ffffff" />{:else}<ArrowRight size={16} />{/if}</button></div>
    <p><LockKeyhole size={11} /> {$_('numbers.changeMindNote')}</p>
  </footer>
  {/if}
</div>

<style>
  .number-picker { --picker-ink: var(--color-ink); --picker-muted: var(--color-muted); --picker-border: var(--color-dot-inactive); color: var(--picker-ink); }
  .icon-button { display: inline-flex; width: 44px; min-height: 44px; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; color: var(--picker-ink); }
  .icon-button-labeled { width: auto; min-height: 36px; gap: 5px; padding: 0 12px; border-radius: 12px; background: rgba(255,255,255,.72); font-size: 11px; font-weight: 700; }
  .grid-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; } h2 { font-size: 15px; font-weight: 750; } .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0 10px; font-size: 10px; color: var(--picker-muted); } .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 12px; height: 12px; border-radius: 3px; display: grid; place-items: center; } .available-dot { background: white; border: 1px solid var(--color-dot-inactive); } .selected-dot { background: #22A35A; color: white; } .taken-dot { background: var(--color-pink-bg); color: var(--color-red); }
  .resume-actions { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .resume-actions button:last-child { color: #8C2530; }
  .grid-skeleton { margin-top: 12px; height: 300px; border-radius: 14px; background: linear-gradient(100deg, #E7ECFA 20%, #F5F7FC 45%, #E7ECFA 70%); background-size: 220% 100%; animation: grid-loading 1.15s linear infinite; }
  @keyframes grid-loading { to { background-position: -220% 0; } }
  .grid-note { font-size: 11px; line-height: 1.7; color: var(--picker-muted); margin: 20px 0; }
  /* Only in the DOM once selected.length > 0 (see the {#if} above), so
     sticking it unconditionally here is already scoped to "once a number
     is picked" for free. bottom matches .native-bottom-nav-clearance's own
     100px reserved space (app.css) — the same distance every scrollable
     page in this app already keeps clear above the bottom tab bar, so this
     sits right above it instead of overlapping or leaving an odd gap. */
  /* position: fixed, not sticky — sticky still occupies its own box at its
     natural in-flow position (right after the grid) *in addition to*
     pulling itself down to this stuck offset, which is what showed as a
     big empty gap of bare background between the grid and the footer
     whenever it wasn't actually stuck yet (i.e. most of the time). Fixed
     has no in-flow footprint at all, so the padding-bottom reserved on
     .numbers-section below is the *only* space this ever occupies — no
     double-counting. Self-contained width/inset math (not reusing the
     shared .app-frame-fixed rule) to sidestep any ambiguity about
     Tailwind's inset-x-* utilities vs. plain CSS cascade order. */
  .selection-footer { position: fixed; left: 16px; right: 16px; max-width: calc(var(--app-max-width) - 32px); margin-inline: auto; bottom: calc(100px + var(--safe-bottom)); z-index: 5; padding: 12px; border-radius: 14px; background: var(--color-card); box-shadow: var(--shadow-card-light); }
  :global(html.telegram-mini-app) .selection-footer { max-width: none; }
  .selection-caption-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; } .selection-caption-row > span { color: var(--picker-muted); }
  .selected-chips { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 5px; min-height: 36px; align-items: center; margin: 6px 0 8px; } .selected-chips button { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 3px; padding: 0 4px; min-height: 34px; overflow: hidden; border-radius: 9px; background: var(--color-action-bg); color: var(--color-primary-dark); font-size: 10px; font-weight: 800; font-variant-numeric: tabular-nums; } .selected-chips .chip-conflict { background: var(--color-pink-bg); color: var(--color-red); }
  .footer-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .footer-action > div { display: flex; flex-direction: column; gap: 1px; } .footer-action > div > span { font-size: 10px; color: var(--picker-muted); } .footer-action strong { font-size: 16px; font-variant-numeric: tabular-nums; } .footer-action small { font-size: 10px; font-weight: 500; } .continue-button { display: flex; gap: 6px; align-items: center; justify-content: center; min-height: 40px; padding: 0 16px; border-radius: 12px; background: var(--color-primary); color: white; font-size: 12px; font-weight: 800; box-shadow: 0 8px 18px -14px rgba(1,41,163,.72), inset 0 1px 0 rgba(255,255,255,.55); } .selection-footer > p { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 9px; color: var(--picker-muted); line-height: 1.5; margin-top: 7px; }
  .picker-message, .resume-panel { display: flex; gap: 10px; padding: 16px; border-radius: 12px; background: #DFEBFA; margin: 16px 0; font-size: 12px; line-height: 1.6; } .resume-panel h2 { font-size: 13px; } .resume-panel p { margin-top: 4px; } .resume-panel button, .picker-message button { display: flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: underline; text-underline-offset: 3px; font-weight: 700; } .error { background: #FDE8E9; color: #A10F1B; } .picker-notice { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.6; padding-bottom: 12px; color: var(--picker-muted); }
  /* The one notice that means "stop, you can't do that" (ticket-limit
     reached) gets the same loud red treatment as .allowance-limit below —
     every other notice here is routine status, not a warning. */
  .picker-notice.notice-warning { padding: 10px 12px; margin-bottom: 4px; border-radius: 10px; background: #FDE8E9; color: #CC1421; font-weight: 700; }

  /* Reached-allowance notice — deliberately the loudest state this picker
     can show (bold red, not the neutral green info tint every other
     message here uses): it's the one message that means "you cannot
     proceed here at all," not just an FYI, so it needs to read as a stop
     sign at a glance rather than blend in with routine notices. */
  .allowance-limit { background: #FDE8E9; color: #CC1421; align-items: flex-start; }
  .allowance-limit-text { margin: 0; font-weight: 800; color: #CC1421; }
  .allowance-limit-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: #CC1421;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
    transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .allowance-limit-cta:active { transform: scale(0.96); }
  button:disabled { cursor: default; } .continue-button:disabled { background: #E7EBFA; color: #627168; box-shadow: none; } .continue-button.is-purchasing:disabled { background: var(--color-primary); color: white; } .icon-button:disabled { opacity: .45; } button:not(:disabled):active { transform: scale(.97); } button:focus-visible, a:focus-visible { outline: 2px solid var(--color-primary-dark); outline-offset: 3px; } ::selection { background: var(--color-bg-end); color: var(--picker-ink); } :global(.spin) { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 359px) { .selection-footer { padding-inline: 14px; } .footer-action { gap: 8px; } .footer-action > div { min-width: 72px; } .continue-button { font-size: 12px; } }
  @media (prefers-reduced-motion: reduce) { .grid-skeleton { animation: none; } :global(.spin) { animation: none; } button:not(:disabled):active { transform: none; } }
</style>
