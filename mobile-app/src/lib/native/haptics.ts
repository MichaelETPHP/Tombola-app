import { Haptics, ImpactStyle } from '@capacitor/haptics';

async function safeHaptic(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    // Haptics are a nicety, never worth breaking an interaction over —
    // e.g. no vibration hardware, or a browser without the Vibration API.
  }
}

/** Quantity steppers, bottom-nav taps — light, frequent interactions. */
export const hapticLight = (): Promise<void> =>
  safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));

/** Buy button, confirmations — deliberate, consequential actions. */
export const hapticMedium = (): Promise<void> =>
  safeHaptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
