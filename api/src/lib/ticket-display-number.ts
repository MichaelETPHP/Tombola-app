import { sql } from '../db/client.js';
import { scrambleIndex } from './ticket-cipher.js';

/** Every display number is scrambled somewhere in [0, DISPLAY_NUMBER_SPACE). */
const DISPLAY_NUMBER_SPACE = 1_000_000;

let cachedCipherKey: string | null = null;

/**
 * The one secret this whole platform's ticket numbers are scrambled with
 * (see migration 030). Fetched once and cached forever for the life of the
 * process — this key must never change once any ticket has been issued
 * (changing it would silently remap every future number, eventually
 * colliding with numbers already handed out), so caching it indefinitely
 * is correct, not just an optimization.
 */
export async function getGlobalCipherKey(): Promise<string> {
  if (cachedCipherKey) return cachedCipherKey;
  const [row] = await sql<{ cipherKey: string }[]>`SELECT cipher_key FROM ticket_number_allocator WHERE id = 1`;
  if (!row?.cipherKey) throw new Error('Ticket number cipher key is not configured — apply migration 030.');
  cachedCipherKey = row.cipherKey;
  return cachedCipherKey;
}

/**
 * A ticket's global 6-digit display number, unique across every raffle this
 * platform will ever run. `blockStart` is this raffle's own reserved,
 * non-overlapping range of *global indices* (allocated at raffle creation —
 * see ticket-block-allocator.ts) — never shown to anyone, purely bookkeeping
 * so two raffles can't compute the same global index for two different
 * tickets. The actual displayed number is that global index run through one
 * Feistel cipher over the *entire* [0, 1,000,000) space (see
 * ticket-cipher.ts), keyed by the single platform-wide secret from
 * getGlobalCipherKey() — so two tickets sitting next to each other in the
 * same raffle land wherever the cipher sends them, anywhere in the full
 * range, not confined to this raffle's slice of it.
 *
 * Computed identically whether previewing an unsold slot on the
 * number-picker wheel or permanently storing it the moment a ticket is
 * actually issued — same formula, same inputs, same result, so what a
 * buyer picks on the wheel is exactly what their ticket shows forever.
 *
 * A `null` blockStart/cipherKey means this raffle predates the numbering
 * system entirely — should not occur going forward, but falls back to a
 * plain zero-padded number rather than crashing if it ever does.
 */
export function formatDisplayNumber(
  blockStart: number | null,
  cipherKey: string | null,
  ticketNumber: number
): string {
  if (blockStart === null || cipherKey === null) {
    return String(ticketNumber).padStart(6, '0');
  }
  const globalIndex = blockStart + (ticketNumber - 1);
  const displayValue = scrambleIndex(globalIndex, DISPLAY_NUMBER_SPACE, cipherKey);
  return String(displayValue).padStart(6, '0');
}
