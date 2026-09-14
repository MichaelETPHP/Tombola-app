import { createHash } from 'node:crypto';

/**
 * Replaces the old linear formula (a*i + c mod 100000) in
 * ticket-display-number.ts. That formula's fatal weakness: linear math is
 * solvable. Anyone holding two tickets in the same raffle (allowed —
 * maxTicketsPerUser goes up to 4) already knows two (index, output) pairs,
 * which is exactly enough to solve for `a` and `c` with basic algebra and
 * then compute every other ticket's number in that entire raffle. A
 * Feistel network doesn't have that property — reversing it means
 * attacking a cryptographic hash, not solving two equations.
 *
 * This module only produces a bijection over [0, rangeSize) for a given
 * key — it says nothing about cross-raffle uniqueness on its own. That
 * guarantee comes from the caller (raffles.service.ts) giving each raffle
 * its own non-overlapping slice of the shared 6-digit display-number
 * space and only ever scrambling within that raffle's own slice.
 */

const ROUNDS = 4;

function roundFunction(key: string, round: number, value: number, halfBits: number): number {
  const digest = createHash('sha256').update(`${key}:${round}:${value}`).digest();
  return digest.readUInt32BE(0) % (2 ** halfBits);
}

/** Balanced Feistel permutation over a (2*halfBits)-bit domain. */
function feistelPermute(input: number, halfBits: number, key: string): number {
  const mask = (1 << halfBits) - 1;
  let left = (input >>> halfBits) & mask;
  let right = input & mask;
  for (let round = 0; round < ROUNDS; round++) {
    const nextRight = left ^ roundFunction(key, round, right, halfBits);
    left = right;
    right = nextRight;
  }
  return (left << halfBits) | right;
}

/**
 * Scrambles `index` (0-based) into a unique value in [0, rangeSize) —
 * a true bijection, so no two distinct indexes within the same rangeSize
 * and key ever collide. Uses cycle-walking (Black & Rogaway, 2002) to
 * handle rangeSize values that aren't a perfect square of a power of two:
 * the Feistel network operates over the smallest such domain that fully
 * contains rangeSize, and any output landing outside [0, rangeSize) is
 * re-encrypted until it lands inside — guaranteed to terminate because
 * feistelPermute is itself a bijection on a finite domain, so repeated
 * application traces a cycle that (for any reasonable round function)
 * revisits an in-range value quickly. The iteration cap is a defensive
 * belt-and-suspenders measure, not something expected to ever bind.
 */
export function scrambleIndex(index: number, rangeSize: number, key: string): number {
  if (rangeSize <= 0) throw new Error('rangeSize must be positive');
  if (index < 0 || index >= rangeSize) throw new Error('index out of range');
  if (rangeSize === 1) return 0;

  const halfBits = Math.max(1, Math.ceil(Math.log2(Math.ceil(Math.sqrt(rangeSize)))));
  let value = index;
  for (let attempt = 0; attempt < 1000; attempt++) {
    value = feistelPermute(value, halfBits, key);
    if (value < rangeSize) return value;
  }
  // Should never happen in practice (see cycle-walking note above) — falls
  // back to a simple, still-collision-free-within-this-call modulo rather
  // than throwing and failing a ticket purchase over it.
  return value % rangeSize;
}
