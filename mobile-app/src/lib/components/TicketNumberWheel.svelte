<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { _ } from 'svelte-i18n';
  import { Check, ChevronDown, ChevronUp } from 'lucide-svelte';
  import { playWheelTick } from '$lib/native/ticketWheelSound.js';
  // Impact, not selectionChanged: Capacitor's selectionChanged only fires
  // reliably on some Android builds after a preceding selectionStart(),
  // which made the wheel feel silent/vibration-less on real devices.
  // impact({style: Light}) has no such prerequisite and always fires.
  import { hapticLight } from '$lib/native/haptics.js';

  type NumberState = 'available' | 'sold' | 'owned' | 'held' | 'held_by_you';
  export let slot: number;
  export let rows: { number: number; state: NumberState; displayNumber: string }[] = [];
  export let value: number | null = null;
  export let selectedNumbers: number[] = [];
  export let disabled = false;
  export let focusNumber: number | null = null;
  export let focusNonce = 0;

  const dispatch = createEventDispatcher<{ change: { slot: number; number: number | null } }>();
  const ITEM_HEIGHT = 42;
  let scroller: HTMLDivElement;
  let candidate: number | null = null;
  let lastIndex = -1;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let engaged = false;
  let mounted = false;
  let appliedFocusNonce = -1;
  let syncingValue = false;
  let flashMessage: string | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // The server (see api/lib/ticket-display-number.ts) is the only source
  // of what a ticket number looks like — this is a lookup into `rows`,
  // never a local computation, so it can never drift from whatever
  // scramble the server actually applied for this raffle.
  $: labelByNumber = new Map(rows.map((row) => [row.number, row.displayNumber]));
  $: label = (number: number) => labelByNumber.get(number) ?? String(number).padStart(5, '0');
  const isUnavailable = (row: { number: number; state: NumberState }) => row.state !== 'available' && row.number !== value;
  const isUsedElsewhere = (number: number) => selectedNumbers.includes(number) && number !== value;
  const canUse = (row: { number: number; state: NumberState }) => !isUnavailable(row) && !isUsedElsewhere(row.number);

  // A short, self-dismissing note for the one moment the wheel overrides
  // what the user actually did — settling past a number that turned out
  // to be unavailable and quietly sliding to the nearest real one instead.
  // Without this the wheel just looks like it "changed its mind" for no
  // reason; two seconds is enough to read a two-word message without
  // sitting there as leftover clutter once it's served its purpose.
  function showFlash(message: string) {
    flashMessage = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMessage = null; }, 2000);
  }

  function flashReasonFor(row: { number: number; state: NumberState }): string {
    return isUsedElsewhere(row.number) ? $_('ticketWheel.flashAlreadyPicked') : $_('ticketWheel.flashTaken');
  }

  function nearestUsable(from: number) {
    for (let distance = 0; distance < rows.length; distance += 1) {
      for (const index of [from - distance, from + distance]) {
        if (rows[index] && canUse(rows[index])) return index;
      }
    }
    return -1;
  }

  async function moveTo(number: number | null, behavior: ScrollBehavior = 'auto') {
    await tick();
    if (!scroller || !rows.length) return;
    let index = number === null ? nearestUsable(Math.min(slot, rows.length - 1)) : rows.findIndex((row) => row.number === number);
    if (index < 0) index = nearestUsable(0);
    if (index < 0) return;
    candidate = rows[index].number;
    lastIndex = index;
    scroller.scrollTo({ top: index * ITEM_HEIGHT, behavior });
  }

  function markEngaged() {
    if (!disabled) engaged = true;
  }

  function handleScroll() {
    if (!rows.length) return;
    const rawIndex = Math.max(0, Math.min(rows.length - 1, Math.round(scroller.scrollTop / ITEM_HEIGHT)));
    if (rawIndex !== lastIndex) {
      lastIndex = rawIndex;
      candidate = rows[rawIndex].number;
      if (engaged) {
        playWheelTick();
        void hapticLight();
      }
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(commitCentered, 110);
  }

  function commitCentered() {
    if (!engaged || disabled || lastIndex < 0) return;
    const usableIndex = nearestUsable(lastIndex);
    if (usableIndex < 0) return;
    if (usableIndex !== lastIndex) {
      const skippedRow = rows[lastIndex];
      if (skippedRow) showFlash(flashReasonFor(skippedRow));
      void moveTo(rows[usableIndex].number, 'smooth');
      return;
    }
    engaged = false;
    const number = rows[usableIndex].number;
    if (number !== value) dispatch('change', { slot, number });
  }

  function chooseRow(number: number) {
    const index = rows.findIndex((row) => row.number === number);
    if (index < 0 || disabled) return;
    if (!canUse(rows[index])) {
      showFlash(flashReasonFor(rows[index]));
      return;
    }
    engaged = false;
    void moveTo(number, 'smooth');
    playWheelTick();
    void hapticLight();
    // The checked centre row is also the clearest removal affordance:
    // tapping it again toggles this slot back to empty.
    dispatch('change', { slot, number: number === value ? null : number });
  }

  function clearSlot() {
    if (disabled || value === null) return;
    playWheelTick();
    void hapticLight();
    dispatch('change', { slot, number: null });
  }

  onMount(() => {
    mounted = true;
    void moveTo(value);
    return () => clearTimeout(settleTimer);
  });

  onDestroy(() => clearTimeout(flashTimer));

  $: if (mounted && value !== null && value !== candidate && !engaged && !syncingValue) {
    syncingValue = true;
    void moveTo(value).finally(() => { syncingValue = false; });
  }

  $: if (mounted && focusNumber !== null && focusNonce !== appliedFocusNonce) {
    appliedFocusNonce = focusNonce;
    void moveTo(focusNumber, 'smooth');
  }
</script>

<div class="wheel-slot" class:filled={value !== null}>
  <div class="slot-label"><span>{slot + 1}</span>{#if value !== null}<button type="button" on:click={clearSlot} disabled={disabled} aria-label={$_('ticketWheel.removeTicketAria', { values: { number: label(value) } })}>{$_('ticketWheel.clear')}</button>{/if}</div>
  <div class="wheel-shell">
    <div class="selection-band" aria-hidden="true"></div>
    <div class="wheel-fade top" aria-hidden="true"></div>
    <div class="wheel-fade bottom" aria-hidden="true"></div>
    <span class="wheel-hint top" aria-hidden="true"><ChevronUp size={13} strokeWidth={2.6} /></span>
    <span class="wheel-hint bottom" aria-hidden="true"><ChevronDown size={13} strokeWidth={2.6} /></span>
    {#if flashMessage}
      <span class="wheel-flash" role="status" transition:scale={{ duration: 160, start: 0.9, easing: cubicOut }}>{flashMessage}</span>
    {/if}
    <div
      bind:this={scroller}
      class="wheel-scroll"
      role="listbox"
      aria-label={$_('ticketWheel.ticketChoiceAria', { values: { n: slot + 1 } })}
      aria-activedescendant={candidate ? `wheel-${slot}-${candidate}` : undefined}
      tabindex={disabled ? -1 : 0}
      on:pointerdown={markEngaged}
      on:touchstart={markEngaged}
      on:wheel={markEngaged}
      on:keydown={markEngaged}
      on:scroll={handleScroll}
    >
      {#each rows as row (row.number)}
        <button
          id="wheel-{slot}-{row.number}"
          type="button"
          role="option"
          aria-selected={value === row.number}
          aria-disabled={isUnavailable(row) || isUsedElsewhere(row.number)}
          class:unavailable={isUnavailable(row)}
          class:held-elsewhere={row.state === 'held' && row.number !== value}
          class:used={isUsedElsewhere(row.number)}
          class:selected={value === row.number}
          on:click={() => chooseRow(row.number)}
          tabindex="-1"
        >
          {label(row.number)}
          {#if value === row.number}<Check size={10} strokeWidth={3} aria-hidden="true" />{/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .wheel-slot { min-width: 0; }
  .slot-label { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 3px; color: #718078; font-size: 9px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }
  .slot-label > span { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: #e7eee9; color: #55665e; }
  .filled .slot-label > span { background: #08765a; color: white; }
  .slot-label button { min-height: 28px; color: #7b4b52; font-size: 9px; font-weight: 700; text-transform: none; letter-spacing: 0; }
  .wheel-shell { position: relative; height: 210px; overflow: hidden; border-radius: 14px; background: rgba(255,255,255,.82); box-shadow: 0 13px 30px -24px rgba(25,60,51,.55); }
  .wheel-scroll { position: absolute; inset: 0; z-index: 2; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y mandatory; scrollbar-width: none; padding-block: 84px; outline: none; }
  .wheel-scroll::-webkit-scrollbar { display: none; }
  .wheel-scroll > button { position: relative; width: 100%; height: 42px; display: flex; align-items: center; justify-content: center; gap: 3px; scroll-snap-align: center; color: #0a0a0a; font-size: 10px; font-weight: 750; font-variant-numeric: tabular-nums; transition: color 120ms ease, opacity 120ms ease, font-size 120ms ease; }
  .wheel-scroll > button[aria-selected='true'] { color: #c81e1e; font-size: 11px; font-weight: 800; }
  .wheel-scroll > button.unavailable { color: #6b6b6b; opacity: .62; font-weight: 800; text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: currentColor; }
  .wheel-scroll > button.held-elsewhere:not(.selected) { color: #a84b57; background: #f9e5e6; opacity: 1; text-decoration: none; border-radius: 6px; }
  .wheel-scroll > button.used:not(.selected) { opacity: .28; }
  .selection-band { position: absolute; z-index: 1; top: 84px; left: 4px; right: 4px; height: 42px; border-block: 1px solid rgba(72,91,82,.14); border-radius: 9px; background: #edf1ef; }
  .filled .selection-band { background: #d5f1e5; border-color: rgba(8,118,90,.28); }
  .wheel-fade { position: absolute; z-index: 3; pointer-events: none; left: 0; right: 0; height: 72px; }
  .wheel-fade.top { top: 0; background: linear-gradient(to bottom, #f8faf9 8%, rgba(248,250,249,0)); }
  .wheel-fade.bottom { bottom: 0; background: linear-gradient(to top, #f8faf9 8%, rgba(248,250,249,0)); }
  /* "You can scroll this" nudge — stays up permanently in every state
     (empty, mid-scroll, a number already picked), by request: the wheel
     itself doesn't otherwise look interactive, so the cue never stops
     being useful. */
  .wheel-hint { position: absolute; z-index: 4; left: 50%; pointer-events: none; color: #08765a; opacity: .78; transform: translateX(-50%); }
  .wheel-hint.top { top: 10px; animation: wheel-hint-up 1.3s ease-in-out infinite; }
  .wheel-hint.bottom { bottom: 10px; animation: wheel-hint-down 1.3s ease-in-out infinite; }
  @keyframes wheel-hint-up { 0%, 100% { transform: translate(-50%, 0); opacity: .5; } 50% { transform: translate(-50%, -5px); opacity: .95; } }
  @keyframes wheel-hint-down { 0%, 100% { transform: translate(-50%, 0); opacity: .5; } 50% { transform: translate(-50%, 5px); opacity: .95; } }
  /* The "settled on an unavailable number, moved you to the nearest real
     one" note — self-dismissing (see showFlash), so it never needs a close
     affordance of its own. Sits centered over the wheel, where the eye
     already is right when this fires. */
  .wheel-flash { position: absolute; z-index: 6; top: 50%; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; padding: 6px 11px; border-radius: 999px; background: #1a1a1a; color: #fff; font-size: 9px; font-weight: 750; letter-spacing: .01em; box-shadow: 0 8px 18px -8px rgba(0,0,0,.45); pointer-events: none; }
  .wheel-scroll:focus-visible { outline: 2px solid #08765a; outline-offset: -3px; border-radius: 14px; }
  @media (max-width: 359px) { .wheel-shell { height: 190px; } .wheel-scroll { padding-block: 74px; } .selection-band { top: 74px; } .wheel-scroll > button { font-size: 9px; } }
  @media (prefers-reduced-motion: reduce) { .wheel-scroll { scroll-behavior: auto; } .wheel-scroll > button { transition: none; } .wheel-hint.top, .wheel-hint.bottom { animation: none; opacity: .7; } }
</style>
