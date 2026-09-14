/**
 * Where in the shared 6-digit (0-999,999) display-number space a new
 * raffle's reserved block lands. Originally this was a simple incrementing
 * counter (raffle 1 got [0, cap), raffle 2 got [cap, cap+cap2), ...) — that
 * guaranteed uniqueness but put every early, small raffle's numbers at the
 * very start of the range, so they all rendered as "0000xx": correctly
 * scrambled *within* the block, but visibly clustered because the block
 * itself never moved.
 *
 * This instead scans every other raffle's already-reserved block, computes
 * the free gaps between them, and picks a uniformly random valid starting
 * position across *all* of those gaps combined — so a block can land
 * anywhere in the full space, not just wherever the previous block happened
 * to end. Still zero-overlap by construction (every position considered is
 * outside every existing block), just no longer front-loaded.
 */

import { AppError } from '../middleware/error-handler.middleware.js';

const DISPLAY_NUMBER_SPACE = 1_000_000;

export function allocateRandomBlock(
  occupiedBlocks: { blockStart: number; ticketCap: number }[],
  size: number
): number {
  const sorted = [...occupiedBlocks].sort((a, b) => a.blockStart - b.blockStart);
  const gaps: { start: number; size: number }[] = [];
  let cursor = 0;
  for (const block of sorted) {
    if (block.blockStart > cursor) gaps.push({ start: cursor, size: block.blockStart - cursor });
    cursor = Math.max(cursor, block.blockStart + block.ticketCap);
  }
  if (cursor < DISPLAY_NUMBER_SPACE) gaps.push({ start: cursor, size: DISPLAY_NUMBER_SPACE - cursor });

  const eligible = gaps
    .map((gap) => ({ start: gap.start, positions: gap.size - size + 1 }))
    .filter((gap) => gap.positions > 0);
  const totalPositions = eligible.reduce((sum, gap) => sum + gap.positions, 0);
  if (totalPositions <= 0) {
    throw new AppError(
      409,
      'Platform has reached its lifetime ticket-code capacity (1,000,000 tickets across every raffle ever run) — cannot create or resize this raffle.'
    );
  }

  let pick = Math.floor(Math.random() * totalPositions);
  for (const gap of eligible) {
    if (pick < gap.positions) return gap.start + pick;
    pick -= gap.positions;
  }
  /* c8 ignore next */
  throw new Error('unreachable: pick exceeded totalPositions');
}
