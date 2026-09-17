import { writable } from 'svelte/store';

export type BannerType = 'default' | 'success';

export interface BannerState {
  message: string;
  visible: boolean;
  type: BannerType;
}

export const banner = writable<BannerState>({ message: '', visible: false, type: 'default' });

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a top banner notification (iOS-style), auto-dismissing after
 * `duration`ms. Returns a promise that resolves once it's done showing,
 * so callers can await it before navigating away.
 *
 * `type: 'success'` is for an action that actually completed (signed in,
 * signed out, tickets issued, profile saved) — it shows green instead of
 * the default blue. A copy-to-clipboard or "here's what happened" notice
 * is informational, not a success confirmation, and stays 'default'.
 */
export function showBanner(message: string, options: { duration?: number; type?: BannerType } = {}): Promise<void> {
  const { duration = 1800, type = 'default' } = options;
  clearTimeout(hideTimer);
  banner.set({ message, visible: true, type });

  return new Promise((resolve) => {
    hideTimer = setTimeout(() => {
      banner.update((s) => ({ ...s, visible: false }));
      resolve();
    }, duration);
  });
}
