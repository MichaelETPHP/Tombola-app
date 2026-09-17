import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { getTelegramMiniApp } from '$lib/telegram.js';

async function safeHaptic(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Haptics are a nicety, never worth breaking an interaction over —
    // e.g. no vibration hardware, or a browser without the Vibration API.
  }
}

/**
 * A Telegram Mini App launch runs inside Telegram's own WebView, which has
 * no Capacitor native runtime — @capacitor/haptics silently no-ops there.
 * Telegram ships its own vibration bridge instead (Bot API 6.1+); reach for
 * that first and only fall back to Capacitor (real native APK, or a plain
 * browser/PWA tab where Capacitor's own web fallback applies) when it's
 * genuinely not a Telegram launch.
 */
function telegramHaptics() {
  return getTelegramMiniApp()?.HapticFeedback ?? null;
}

/** Quantity steppers, bottom-nav taps — light, frequent interactions. */
export const hapticLight = (): Promise<void> =>
  safeHaptic(() => {
    const tg = telegramHaptics();
    if (tg) return tg.impactOccurred('light');
    return Haptics.impact({ style: ImpactStyle.Light });
  });

/** Native picker-wheel detents: subtler than a button impact. */
export const hapticSelection = (): Promise<void> =>
  safeHaptic(() => {
    const tg = telegramHaptics();
    if (tg) return tg.selectionChanged();
    return Haptics.selectionChanged();
  });

/** Buy button, confirmations — deliberate, consequential actions. */
export const hapticMedium = (): Promise<void> =>
  safeHaptic(() => {
    const tg = telegramHaptics();
    if (tg) return tg.impactOccurred('medium');
    return Haptics.impact({ style: ImpactStyle.Medium });
  });
