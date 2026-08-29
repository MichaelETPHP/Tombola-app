import {
  findDrawTriggerByToken,
  markDrawTriggerClicked,
  createDrawResult,
} from '../../db/queries/draws.queries.js';
import { findRaffleById, updateRaffleStatus } from '../../db/queries/raffles.queries.js';
import { listRaffleTickets } from '../../db/queries/tickets.queries.js';
import { createPayout } from '../../db/queries/payouts.queries.js';
import { generateServerSeed, commitServerSeed, computeWinner } from '../../lib/provably-fair.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/**
 * Process a trigger link click — execute the draw.
 *
 * The server seed is generated HERE, at execution time, rather than
 * pre-committed when the raffle opened. The schema only has a place to
 * store server_seed/server_seed_hash on `draw_results`, which can't exist
 * before a `draw_triggers` row does (which itself only exists once the
 * raffle locks) — so there's nowhere to persist a hash before this point.
 * This means the classic "hash published before ticket sales" guarantee
 * doesn't hold with the current schema; what's still true is that the
 * seed can't be chosen after the winner would be known, since the winning
 * ticket is derived from server_seed + this click's timestamp together.
 */
export async function executeDraw(token: string, clickedIp: string | null = null) {
  // 1. Find and validate the trigger
  const trigger = await findDrawTriggerByToken(token);

  if (!trigger) {
    throw new AppError(404, 'Invalid trigger link');
  }

  if (trigger.status !== 'pending') {
    if (trigger.status === 'clicked') {
      throw new AppError(400, 'This draw has already been completed');
    }
    throw new AppError(400, 'This trigger link has expired');
  }

  if (trigger.expiresAt < new Date()) {
    throw new AppError(400, 'This trigger link has expired');
  }

  // 2. Get the raffle and validate state
  const raffle = await findRaffleById(trigger.raffleId);
  if (!raffle) {
    throw new AppError(500, 'Raffle not found for draw');
  }

  // 3. Get all tickets for the raffle
  const tickets = await listRaffleTickets(trigger.raffleId);
  if (tickets.length === 0) {
    throw new AppError(500, 'No tickets found for raffle');
  }

  // 4. Generate the server seed and a client seed from the click timestamp
  const serverSeed = generateServerSeed();
  const serverSeedHash = await commitServerSeed(serverSeed);
  const clientSeed = Date.now().toString();

  // 5. Compute winner using the provably-fair algorithm
  const { winnerIndex, combinedHash } = await computeWinner(serverSeed, clientSeed, tickets.length);

  const winningTicket = tickets[winnerIndex];
  if (!winningTicket) {
    throw new AppError(500, 'Failed to determine winning ticket');
  }

  // 6. Mark the trigger clicked and record the draw result
  await markDrawTriggerClicked(trigger.id, clickedIp);

  const drawResult = await createDrawResult({
    raffleId: trigger.raffleId,
    drawTriggerId: trigger.id,
    serverSeed,
    serverSeedHash,
    clientSeed,
    finalSeedHash: combinedHash,
    winningTicketNumber: winningTicket.ticketNumber,
    winnerUserId: winningTicket.userId,
  });

  // 7. Update raffle status to completed
  await updateRaffleStatus(trigger.raffleId, 'completed');

  // 8. Create payout record with 7-day claim deadline
  const claimDeadline = new Date();
  claimDeadline.setDate(claimDeadline.getDate() + 7);

  await createPayout({
    raffleId: trigger.raffleId,
    drawResultId: drawResult.id,
    winnerUserId: winningTicket.userId,
    grossPrizeValue: raffle.prizeValue,
    claimDeadline,
  });

  logger.info(
    `Draw completed for raffle ${trigger.raffleId}: ticket #${winningTicket.ticketNumber} (user ${winningTicket.userId})`
  );

  return {
    raffleId: trigger.raffleId,
    raffleName: raffle.title,
    winnerTicketNumber: winningTicket.ticketNumber,
    totalTickets: tickets.length,
    serverSeed,
    clientSeed,
    combinedHash,
    serverSeedHash,
    message: 'Draw completed! The winner has been notified.',
  };
}
