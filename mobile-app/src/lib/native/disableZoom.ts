/**
 * Blocks pinch-zoom app-wide. `touch-action: pan-x pan-y` (app.css) and
 * the viewport meta tag (app.html) already disable both pinch- and
 * double-tap-zoom in any touch-action-compliant WebView — that alone is
 * enough everywhere Capacitor and Telegram's Mini App WebView run. This
 * only covers the gap: iOS WebKit fires its own non-standard
 * `gesturestart`/`gesturechange` events for pinch that ignore
 * touch-action entirely. No touchend/double-tap timer here on purpose —
 * that classic snippet also swallows legitimate fast double-taps, like
 * repeatedly tapping a ticket-quantity +/- stepper.
 */
export function disableZoom(): void {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });

  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
}
