import { goto } from '$app/navigation';

/**
 * Real back navigation when there's history to go back to (preserves
 * scroll position, filter state, etc. on whatever screen you came from)
 * — only falls back to Home when there isn't, e.g. this screen was
 * opened directly via a deep link with no prior screen in this session.
 */
export function navigateBack(): void {
  if (window.history.length > 1) {
    history.back();
  } else {
    goto('/home');
  }
}
