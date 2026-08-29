<script lang="ts">
  import type { Writable } from 'svelte/store';
  import IosSpinner from './IosSpinner.svelte';
  import { hapticLight } from '$lib/native/haptics.js';
  import type { RefreshHandler } from '$lib/stores/pullRefresh.js';

  export let handler: Writable<RefreshHandler>;

  // Raw finger travel needed to trigger a refresh on release — roughly
  // matches native iOS. The visible pull distance is damped well below
  // this (see touchmove) so the gesture still feels resistant, not 1:1.
  const TRIGGER_DISTANCE = 70;
  const MAX_VISUAL = 60;

  let startY = 0;
  let rawDelta = 0;
  let dragging = false;
  let pulling = false;
  let refreshing = false;

  $: pullDistance = refreshing ? MAX_VISUAL : Math.min(MAX_VISUAL, rawDelta * 0.5);
  $: progress = Math.min(1, pullDistance / MAX_VISUAL);

  function handleTouchStart(e: TouchEvent) {
    if (refreshing || !$handler) return;
    // Only start tracking once the page is already scrolled to the very
    // top — mirrors iOS, and keeps normal scrolling completely untouched.
    if (window.scrollY > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
    pulling = false;
    rawDelta = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!dragging || refreshing || !$handler) return;
    const delta = e.touches[0].clientY - startY;
    if (delta <= 0 || window.scrollY > 0) {
      rawDelta = 0;
      pulling = false;
      return;
    }
    // Only hijack the touch once it's clearly a deliberate downward pull,
    // not the first few px of a tap or an upward scroll starting point.
    if (delta > 8) {
      pulling = true;
      e.preventDefault();
      rawDelta = delta;
    }
  }

  async function handleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    if (pulling && rawDelta >= TRIGGER_DISTANCE && $handler) {
      refreshing = true;
      hapticLight();
      try {
        await $handler();
      } finally {
        refreshing = false;
        rawDelta = 0;
      }
    } else {
      rawDelta = 0;
    }
    pulling = false;
  }
</script>

<div
  role="presentation"
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchEnd}
>
  <div
    class="flex items-center justify-center overflow-hidden"
    style="height: {pullDistance}px; opacity: {progress}; transition: {dragging ? 'none' : 'height 220ms var(--ease-out), opacity 220ms var(--ease-out)'};"
    aria-hidden={!refreshing}
    role="status"
    aria-live="polite"
    aria-label={refreshing ? 'Refreshing' : undefined}
  >
    <IosSpinner size={22} color="#00B589" />
  </div>
  <div style="transform: translateY({pullDistance}px); transition: {dragging ? 'none' : 'transform 220ms var(--ease-out)'};">
    <slot />
  </div>
</div>
