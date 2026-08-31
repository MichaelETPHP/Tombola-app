<script lang="ts">
  import { page } from '$app/stores';
  import { ROOT_TABS } from '$lib/native/backButton.js';
  import { navigateBack } from '$lib/native/navigateBack.js';
  import { hapticLight } from '$lib/native/haptics.js';

  // Pure touch-gesture, not a platform API — works identically inside the
  // Telegram Mini App's WebView, the native APK's WebView, and a plain
  // mobile browser tab, since none of those give a web page an edge-swipe
  // gesture for free the way native iOS apps get one automatically.
  const EDGE_ZONE_PX = 24;
  // Direction-lock threshold — the first few touch samples always wobble
  // a little regardless of intent; below this, don't commit to either a
  // horizontal drag or a vertical scroll yet.
  const DIRECTION_LOCK_PX = 10;
  const COMMIT_DISTANCE_RATIO = 0.28; // 28% of the screen dragged
  const COMMIT_VELOCITY = 0.5; // px/ms — a quick flick commits regardless of distance

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let dragging = false;
  let armed = false; // past the direction lock, committed to this being a horizontal drag
  let dragX = 0;
  let viewportWidth = 0;
  let wrapperEl: HTMLDivElement;

  $: isRootTab = ROOT_TABS.includes($page.url.pathname);

  function handleTouchStart(e: TouchEvent) {
    if (isRootTab) return;
    if ((e.target as Element)?.closest?.('[data-swipe-region]')) return;
    const touch = e.touches[0];
    if (touch.clientX > EDGE_ZONE_PX) return;

    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    dragging = true;
    armed = false;
    dragX = 0;
    viewportWidth = window.innerWidth;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!dragging) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (!armed) {
      if (Math.abs(deltaX) < DIRECTION_LOCK_PX && Math.abs(deltaY) < DIRECTION_LOCK_PX) return;
      // A clearer vertical intent means this was always a scroll, not an
      // edge-swipe — hand it back to the page immediately.
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        dragging = false;
        return;
      }
      armed = true;
    }

    if (deltaX <= 0) {
      dragX = 0;
      return;
    }
    e.preventDefault();
    dragX = deltaX;
  }

  function handleTouchEnd() {
    if (!dragging) return;
    dragging = false;
    if (!armed) return;

    const elapsed = Math.max(1, Date.now() - startTime);
    const velocity = dragX / elapsed;
    const commit = dragX / viewportWidth > COMMIT_DISTANCE_RATIO || velocity > COMMIT_VELOCITY;

    if (commit) {
      hapticLight();
      // Finish the motion off-screen before actually navigating — a hard
      // cut mid-drag would read as the gesture failing partway through.
      dragX = viewportWidth;
      setTimeout(navigateBack, 180);
    } else {
      dragX = 0;
    }
    armed = false;
  }
</script>

<div
  bind:this={wrapperEl}
  role="presentation"
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchEnd}
  class="swipe-back-wrapper"
  class:swipe-back-wrapper--interacting={dragging || dragX !== 0}
  style={dragX !== 0 || dragging
    ? `transform: translate3d(${dragX}px, 0, 0); transition: ${dragging ? 'none' : 'transform 200ms var(--ease-out)'}; box-shadow: ${dragX > 0 ? '-12px 0 24px rgba(0,0,0,0.12)' : 'none'};`
    : ''}
>
  <slot />
</div>

<style>
  .swipe-back-wrapper {
    min-height: 100dvh;
  }

  /*
   * will-change/transform on an ancestor makes any `position: fixed`
   * descendant (BottomNav, toasts, ...) position itself relative to THIS
   * element instead of the viewport — that's what makes the slide-away
   * animation include them, which is correct while an edge-swipe is
   * actually happening, but would otherwise pin BottomNav to page
   * content and make it scroll away during completely normal scrolling
   * if left on permanently. Scoped to only the moment of interaction
   * (plus its brief settle animation) via this conditional class —
   * everything returns to genuine viewport-fixed positioning once
   * dragX settles back to exactly 0 and this class drops off.
   */
  .swipe-back-wrapper--interacting {
    will-change: transform;
  }
</style>
