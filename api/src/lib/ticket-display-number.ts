import { scrambleIndex } from './ticket-cipher.js';

/**
 * A ticket's global 6-digit display number, unique across every raffle
 * this platform will ever run — not just within one raffle. Two parts:
 *   - blockStart: this raffle's own reserved, non-overlapping slice of the
 *     shared 0-999999 space (allocated once, atomically, at raffle
 *     creation — see raffles.queries.ts::createRaffle).
 *   - the Feistel-scrambled offset of this ticket's number within that
 *     raffle (see ticket-cipher.ts for why a cipher instead of the old
 *     linear formula, which two tickets in one raffle was enough to
 *     reverse-engineer).
 * Computed identically whether previewing an unsold slot on the
 * number-picker wheel (ticket-availability.queries.ts) or permanently
 * storing it the moment a ticket is actually issued (tickets.queries.ts) —
 * same formula, same inputs, same result, so what a buyer picks on the
 * wheel is exactly what their ticket shows forever after.
 *
 * A `null` blockStart/numberSeed means this raffle predates the block
 * system entirely — should not occur going forward (every raffle has
 * predated tickets deleted and gets a block from creation), but falls
 * back to a plain zero-padded number rather than crashing if it ever does.
 */
export function formatDisplayNumber(
  blockStart: number | null,
  numberSeed: number | null,
  ticketNumber: number,
  ticketCap: number
): string {
  if (blockStart === null || numberSeed === null) {
    return String(ticketNumber).padStart(6, '0');
  }
  const offset = scrambleIndex(ticketNumber - 1, ticketCap, String(numberSeed));
  return String(blockStart + offset).padStart(6, '0');
}

/** A fresh per-raffle cipher key — call once at raffle creation, never reused or persisted anywhere else. */
export function generateNumberSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1; // fits a Postgres INTEGER column
}
