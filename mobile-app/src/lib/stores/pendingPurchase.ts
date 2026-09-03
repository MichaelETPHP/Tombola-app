const KEY = 'yeneeta:pendingPurchase';
const LEGACY_KEY = 'tombola:pendingPurchase';

export interface PendingPurchase {
  raffleId: string;
  quantity: number;
}

/**
 * Guests can browse and pick a ticket quantity before signing in — this
 * survives the phone → OTP round trip (a full page navigation) so the
 * raffle page can restore it once the user is authenticated.
 */
export function setPendingPurchase(purchase: PendingPurchase): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(purchase));
  } catch {
    // sessionStorage unavailable (e.g. private mode) — resume just won't have anything to restore.
  }
}

export function getPendingPurchase(): PendingPurchase | null {
  try {
    const raw = sessionStorage.getItem(KEY) ?? sessionStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as PendingPurchase) : null;
  } catch {
    return null;
  }
}

export function clearPendingPurchase(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
