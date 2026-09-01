import { writable } from 'svelte/store';
import type { RoomSummary } from '$lib/schemas/index.js';

/** Number of rooms with activity the user hasn't opened yet — badge count
 *  on the Profile nav tab. Deliberately "rooms with something new", not a
 *  precise per-message unread total: the API doesn't track read-receipts,
 *  so this is the honest, simple thing that can be known client-side. */
export const unreadRoomCount = writable(0);

const lastSeenByRoom = new Map<string, string>();
const unreadRoomIds = new Set<string>();
let baselined = false;

function recompute() {
  unreadRoomCount.set(unreadRoomIds.size);
}

/** Call when the user actually opens a room (or sends/receives a message
 *  while already inside it) — that room's activity is now "seen", clearing
 *  its contribution to the badge. */
export function markRoomSeen(raffleId: string | undefined, atIso?: string): void {
  if (!raffleId) return;
  if (atIso) lastSeenByRoom.set(raffleId, atIso);
  if (unreadRoomIds.delete(raffleId)) recompute();
}

/** Feed the latest `/rooms` summaries in. Returns true if this call found
 *  genuinely new activity (i.e. worth ringing the notification sound for),
 *  false on the first-ever call (existing history isn't "new") or when
 *  nothing changed. `excludeRaffleId` is the room currently open on
 *  screen, if any — its own page already handles seen-tracking in real
 *  time, so the global poller shouldn't double-count or double-ring it. */
export function processRoomSummaries(rooms: RoomSummary[], excludeRaffleId?: string): boolean {
  if (!baselined) {
    for (const r of rooms) if (r.lastMessageAt) lastSeenByRoom.set(r.raffleId, r.lastMessageAt);
    baselined = true;
    return false;
  }

  let hasNew = false;
  for (const r of rooms) {
    if (!r.lastMessageAt || r.raffleId === excludeRaffleId) continue;
    const seen = lastSeenByRoom.get(r.raffleId);
    if (!seen || new Date(r.lastMessageAt) > new Date(seen)) {
      lastSeenByRoom.set(r.raffleId, r.lastMessageAt);
      unreadRoomIds.add(r.raffleId);
      hasNew = true;
    }
  }
  if (hasNew) recompute();
  return hasNew;
}
