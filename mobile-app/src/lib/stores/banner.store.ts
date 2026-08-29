import { writable } from 'svelte/store';

export interface BannerState {
  message: string;
  visible: boolean;
}

export const banner = writable<BannerState>({ message: '', visible: false });

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a top banner notification (iOS-style), auto-dismissing after
 * `duration`ms. Returns a promise that resolves once it's done showing,
 * so callers can await it before navigating away.
 */
export function showBanner(message: string, duration = 1800): Promise<void> {
  clearTimeout(hideTimer);
  banner.set({ message, visible: true });

  return new Promise((resolve) => {
    hideTimer = setTimeout(() => {
      banner.update((s) => ({ ...s, visible: false }));
      resolve();
    }, duration);
  });
}
