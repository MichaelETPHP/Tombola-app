<script lang="ts">
  import { onMount } from 'svelte';
  import type { Writable } from 'svelte/store';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import IosSpinner from './IosSpinner.svelte';
  import { hapticLight } from '$lib/native/haptics.js';
  import type { RefreshHandler } from '$lib/stores/pullRefresh.js';

  export let handler: Writable<RefreshHandler>;

  // Three graduated thresholds instead of one flat trigger distance — the
  // user sees "1 → 2 → 3" count up as they pull, with a tick each step.
  // Releasing before reaching 3 cancels with no refresh at all. This is
  // what actually fixes accidental triggers during a fast flick back to
  // the top of the page: instead of a refresh firing as a surprise the
  // instant you let go past one flat distance, there's visible warning
  // and a real chance to bail before it's armed.
  //
  // ENGAGE_THRESHOLD is deliberately well above ordinary touch jitter — a
  // normal scroll-down-into-content swipe starts with the finger moving
  // *up* (delta goes negative immediately), but the first couple of
  // reported touch samples can wobble a few px in either direction before
  // the real trajectory settles. At 8px that wobble alone was enough to
  // flip `pulling` on and fire a haptic tick before the very next sample
  // corrected it back — a felt buzz on a completely normal scroll.
  const ENGAGE_THRESHOLD = 24;
  const THRESHOLDS = [40, 70, 100];
  const MAX_VISUAL = 64;

  let startY = 0;
  let rawDelta = 0;
  let dragging = false;
  let pulling = false;
  let refreshing = false;
  let count = 0;
  // Once a gesture has clearly moved upward (scrolling into content), never
  // let it re-engage pull-tracking later in that same continuous touch —
  // covers one long swipe that starts at the top and scrolls deep down.
  let lockedOut = false;

  // Momentum from a normal upward flick very often overshoots all the way
  // to scrollY 0 on its own, with no finger touching the screen at all.
  // Someone mid-page doing several quick swipes in a row will frequently
  // have their *next* touch land in that split second right after — the
  // page really is at scrollY 0 at that exact instant, even though from
  // their side it reads as "I was still in the middle of the list."
  // scrollY alone can't tell a deliberate pull apart from that; requiring
  // scrolling to have been fully quiet for a beat first can.
  const SCROLL_SETTLE_MS = 250;
  let lastScrollAt = 0;

  // A plain `<svelte:window on:scroll>` only ever catches window's own
  // scroll — since body is the actual scroller here (see below), that
  // event may never fire at all. A capturing listener on document sees
  // the scroll regardless of which element is actually doing it.
  onMount(() => {
    const onScroll = () => {
      lastScrollAt = Date.now();
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => document.removeEventListener('scroll', onScroll, true);
  });

  // NOT window.scrollY. This app sets overflow-x: hidden on html and body
  // without an explicit overflow-y — per the CSS spec, that alone forces
  // overflow-y's default `visible` to compute as `auto` on *both*
  // elements, which makes `body` its own independent scroll container
  // nested inside `html` rather than the window itself scrolling. window
  // .scrollY reports the window's own scroll, which then stays 0 no
  // matter how far into the page body has actually scrolled — exactly
  // why pull-to-refresh could fire "from the middle" of a long page.
  // document.scrollingElement resolves to whichever element is actually
  // the real scrolling one, regardless of this ambiguity.
  function currentScrollTop(): number {
    return document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop;
  }

  $: pullDistance = refreshing ? MAX_VISUAL : Math.min(MAX_VISUAL, rawDelta * 0.45);
  $: progress = Math.min(1, pullDistance / MAX_VISUAL);
  $: armed = count >= THRESHOLDS.length;
  $: indicatorY = pullDistance - 44;

  function handleTouchStart(e: TouchEvent) {
    if (refreshing || !$handler) return;
    // Only start tracking once the page is already scrolled to the very
    // top — mirrors iOS, and keeps normal scrolling completely untouched.
    if (currentScrollTop() > 0) return;
    // Scroll position only just reached 0 (likely momentum still settling
    // from the last swipe) — this touch is almost certainly a continuation
    // of ordinary scrolling, not a deliberate pull. Wait for it to go quiet.
    if (Date.now() - lastScrollAt < SCROLL_SETTLE_MS) return;
    // A touch starting inside a horizontal-swipe region (the banner
    // carousel) is never a pull attempt, even at scrollY 0 — without this,
    // a fast carousel swipe with any vertical component could cross the
    // pull thresholds and hijack what should be a pure horizontal gesture.
    if ((e.target as Element)?.closest?.('[data-swipe-region]')) return;
    startY = e.touches[0].clientY;
    dragging = true;
    pulling = false;
    rawDelta = 0;
    count = 0;
    lockedOut = false;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!dragging || refreshing || !$handler) return;
    const delta = e.touches[0].clientY - startY;

    // A clear upward movement means this is a normal scroll, not a pull —
    // lock it out for the rest of this touch so it can't flip back on
    // later if the same continuous gesture wobbles direction again.
    if (delta < -ENGAGE_THRESHOLD) lockedOut = true;

    if (lockedOut || delta <= 0 || currentScrollTop() > 0) {
      rawDelta = 0;
      pulling = false;
      count = 0;
      return;
    }
    // Only hijack the touch once it's clearly a deliberate downward pull —
    // ENGAGE_THRESHOLD is well above ordinary touch-sampling jitter, so a
    // normal scroll's first few uncertain px never reaches it.
    if (delta > ENGAGE_THRESHOLD) {
      pulling = true;
      e.preventDefault();
      rawDelta = delta;

      const nextCount = THRESHOLDS.filter((t) => delta >= t).length;
      if (nextCount !== count) {
        count = nextCount;
        hapticLight();
      }
    }
  }

  async function handleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    if (pulling && armed && $handler) {
      refreshing = true;
      try {
        await $handler();
      } finally {
        refreshing = false;
        rawDelta = 0;
        count = 0;
      }
    } else {
      // Didn't make it to 3 — cancel outright, no refresh call at all.
      rawDelta = 0;
      count = 0;
    }
    pulling = false;
  }
</script>

<div
  role="presentation"
  class="relative touch-pan-y"
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchEnd}
>
  <div
    class="pointer-events-none absolute inset-x-0 top-0 z-[1] flex h-10 items-center justify-center"
    style="transform: translate3d(0, {indicatorY}px, 0); opacity: {progress}; transition: {dragging ? 'none' : 'transform 220ms var(--ease-out), opacity 180ms var(--ease-out)'};"
    aria-hidden={!refreshing}
    role="status"
    aria-live="polite"
    aria-label={refreshing ? 'Refreshing' : armed ? 'Release to refresh' : undefined}
  >
    {#if refreshing}
      <IosSpinner size={22} color="#00B589" />
    {:else if pulling && count > 0}
      {#key count}
        <span
          in:scale={{ duration: 160, start: 0.7, opacity: 0, easing: cubicOut }}
          class="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-extrabold transition-colors duration-150 {armed
            ? 'bg-primary text-[#10211d]'
            : 'bg-bg-start text-primary-dark'}"
        >
          {count}
        </span>
      {/key}
    {/if}
  </div>
  <div
    class="pull-content"
    style="transform: translate3d(0, {pullDistance}px, 0); transition: {dragging ? 'none' : 'transform 220ms var(--ease-out)'};"
  >
    <slot />
  </div>
</div>

<style>
  .pull-content {
    backface-visibility: hidden;
  }
</style>
