<script lang="ts">
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { _ } from 'svelte-i18n';
  import { Check } from 'lucide-svelte';
  import { playWheelTick } from '$lib/native/ticketWheelSound.js';
  import { hapticLight } from '$lib/native/haptics.js';

  type NumberState = 'available' | 'sold' | 'owned' | 'held' | 'held_by_you';
  export let rows: { number: number; state: NumberState; displayNumber: string }[] = [];
  export let selectedNumbers: number[] = [];
  export let disabled = false;
  export let focusNumber: number | null = null;
  export let focusNonce = 0;

  let container: HTMLDivElement;
  let flashMessage: string | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let appliedFocusNonce = -1;

  const isSelected = (number: number) => selectedNumbers.includes(number);
  const isPickable = (row: { number: number; state: NumberState }) => row.state === 'available' || isSelected(row.number);

  function showFlash(message: string) {
    flashMessage = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMessage = null; }, 2000);
  }

  export let onToggle: (number: number) => void = () => {};

  function tap(row: { number: number; state: NumberState }) {
    if (disabled) return;
    if (!isPickable(row)) {
      showFlash($_('numbers.occupied'));
      return;
    }
    playWheelTick();
    void hapticLight();
    onToggle(row.number);
  }

  // A "radio-tuner" detent on every ~40px scrolled, mirroring the old
  // wheel's per-row tick — but suppressed while a programmatic scroll
  // (search-driven scrollToFocused below) is in flight, so jumping to a
  // found number doesn't itself sound like a manual scroll.
  const TICK_DISTANCE = 40;
  let lastTickScrollTop = 0;
  let suppressTicksUntil = 0;

  function handleScroll() {
    if (!container) return;
    if (performance.now() < suppressTicksUntil) {
      lastTickScrollTop = container.scrollTop;
      return;
    }
    if (Math.abs(container.scrollTop - lastTickScrollTop) >= TICK_DISTANCE) {
      lastTickScrollTop = container.scrollTop;
      playWheelTick();
      void hapticLight();
    }
  }

  async function scrollToFocused() {
    await tick();
    if (!container || focusNumber === null) return;
    const el = container.querySelector<HTMLElement>(`[data-number="${focusNumber}"]`);
    if (!el) return;
    suppressTicksUntil = performance.now() + 700;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $: if (focusNonce > 0 && focusNonce !== appliedFocusNonce) {
    appliedFocusNonce = focusNonce;
    void scrollToFocused();
  }
</script>

<div class="grid-shell">
  {#if flashMessage}
    <span class="grid-flash" role="status" transition:scale={{ duration: 160, start: 0.9, easing: cubicOut }}>{flashMessage}</span>
  {/if}
  <span class="grid-fade top" aria-hidden="true"></span>
  <span class="grid-fade bottom" aria-hidden="true"></span>
  <div
    bind:this={container}
    class="grid-scroll"
    role="listbox"
    aria-label={$_('numbers.gridSectionAria')}
    aria-multiselectable="true"
    on:scroll={handleScroll}
  >
    {#each rows as row (row.number)}
      <button
        type="button"
        data-number={row.number}
        role="option"
        aria-selected={isSelected(row.number)}
        aria-disabled={!isPickable(row)}
        class:unavailable={!isPickable(row)}
        class:sold={row.state === 'sold' && !isSelected(row.number)}
        class:held-elsewhere={row.state === 'held' && !isSelected(row.number)}
        class:yours={(row.state === 'owned' || row.state === 'held_by_you') && !isSelected(row.number)}
        class:selected={isSelected(row.number)}
        on:click={() => tap(row)}
      >
        {row.displayNumber}
        {#if isSelected(row.number)}<Check size={11} strokeWidth={3} aria-hidden="true" />{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .grid-shell { position: relative; border-radius: 14px; background: rgba(255,255,255,.82); box-shadow: 0 13px 30px -24px rgba(8,14,73,.55); }
  .grid-scroll {
    max-height: min(46vh, 440px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 7px;
    padding: 12px;
  }
  .grid-scroll > button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 42px;
    border-radius: 9px;
    border: 1px solid rgba(72,91,82,.14);
    background: #ECF0FA;
    color: #0a0a0a;
    font-size: 11px;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
    transition: transform 120ms ease, background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .grid-scroll > button:not(:disabled):active { transform: scale(.95); }
  .grid-scroll > button.selected { background: #0129A3; border-color: #0129A3; color: #fff; }
  .grid-scroll > button.unavailable { color: #6b6b6b; opacity: .62; font-weight: 800; text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: currentColor; background: #F1F3FA; }
  /* Sold — gone for good, to someone else — reads as the loudest "no" of
     the three unavailable states: a red strike, not just a muted one. */
  .grid-scroll > button.sold { color: #CC1421; opacity: .85; background: #fdecee; border-color: rgba(204,20,33,.22); text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: currentColor; }
  .grid-scroll > button.held-elsewhere { color: #B23A45; background: #FBE7E8; opacity: 1; text-decoration: none; border-color: rgba(178,58,69,.2); }
  .grid-scroll > button.yours { color: #0129A3; background: #D6E1F9; opacity: 1; text-decoration: none; border-color: rgba(1,41,163,.25); }
  .grid-flash { position: absolute; z-index: 6; top: 10px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 6px 11px; border-radius: 999px; background: #1a1a1a; color: #fff; font-size: 10px; font-weight: 750; letter-spacing: .01em; box-shadow: 0 8px 18px -8px rgba(0,0,0,.45); pointer-events: none; }
  /* iOS-picker-style edge fades — signal "there's more above/below" the
     same way a UIPickerView's top/bottom mask does, without a hard visual
     cut where the scrollable area ends. */
  .grid-fade { position: absolute; z-index: 3; pointer-events: none; left: 1px; right: 1px; height: 28px; }
  .grid-fade.top { top: 1px; background: linear-gradient(to bottom, rgba(255,255,255,.88) 15%, rgba(255,255,255,0)); border-radius: 14px 14px 0 0; }
  .grid-fade.bottom { bottom: 1px; background: linear-gradient(to top, rgba(255,255,255,.88) 15%, rgba(255,255,255,0)); border-radius: 0 0 14px 14px; }
  @media (prefers-reduced-motion: reduce) { .grid-scroll > button { transition: none; } .grid-scroll > button:not(:disabled):active { transform: none; } }
</style>
