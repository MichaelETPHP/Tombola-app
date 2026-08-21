import { findDrawByToken, completeDraw as dbCompleteDraw } from '../../db/queries/draws.queries.js';
import { findRaffleById, updateRaffleStatus } from '../../db/queries/raffles.queries.js';
import { listRaffleTickets } from '../../db/queries/tickets.queries.js';
import { createPayout } from '../../db/queries/payouts.queries.js';
import { computeWinner } from '../../lib/provably-fair.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/**
 * Process a trigger link click — execute the draw.
 * 
 * This is the core provably-fair draw execution:
 * 1. Validate the trigger token and check it hasn't expired
 * 2. Use the click timestamp as the client seed
 * 3. Combine with the server seed and compute the winner
 * 4. Record everything for public verification
 * 5. Create the payout record
 */
export async function executeDraw(token: string) {
  // 1. Find and validate the draw
  const draw = await findDrawByToken(token);

  if (!draw) {
    throw new AppError(404, 'Invalid trigger link');
  }

  if (draw.status !== 'pending_trigger') {
    if (draw.status === 'completed') {
      throw new AppError(400, 'This draw has already been completed');
    }
    if (draw.status === 'expired') {
      throw new AppError(400, 'This trigger link has expired');
    }
    throw new AppError(400, `Draw is in unexpected state: ${draw.status}`);
  }

  if (draw.triggerExpiresAt < new Date()) {
    throw new AppError(400, 'This trigger link has expired');
  }

  // 2. Get the raffle and validate state
  const raffle = await findRaffleById(draw.raffleId);
  if (!raffle) {
    throw new AppError(500, 'Raffle not found for draw');
  }

  // 3. Get all tickets for the raffle
  const tickets = await listRaffleTickets(draw.raffleId);
  if (tickets.length === 0) {
    throw new AppError(500, 'No tickets found for raffle');
  }

  // 4. Generate client seed from click timestamp
  const clientSeed = Date.now().toString();

  // 5. Compute winner using provably-fair algorithm
  const { winnerIndex, combinedHash } = await computeWinner(
    raffle.serverSeed,
    clientSeed,
    tickets.length
  );

  // The winner is determined by the index into the sorted ticket array
  const winningTicket = tickets[winnerIndex];

  if (!winningTicket) {
    throw new AppError(500, 'Failed to determine winning ticket');
  }

  // 6. Complete the draw record
  await dbCompleteDraw(draw.id, {
    clientSeed,
    serverSeed: raffle.serverSeed,
    combinedHash,
    winnerTicketNumber: winningTicket.ticketNumber,
    winnerUserId: winningTicket.userId,
  });

  // 7. Update raffle status to completed
  await updateRaffleStatus(draw.raffleId, 'completed');

  // 8. Create payout record with 7-day claim deadline
  const claimDeadline = new Date();
  claimDeadline.setDate(claimDeadline.getDate() + 7);

  await createPayout({
    drawId: draw.id,
    raffleId: draw.raffleId,
    winnerUserId: winningTicket.userId,
    claimDeadline,
  });

  logger.info(
    `Draw completed for raffle ${draw.raffleId}: ticket #${winningTicket.ticketNumber} (user ${winningTicket.userId})`
  );

  return {
    raffleId: draw.raffleId,
    raffleName: raffle.title,
    winnerTicketNumber: winningTicket.ticketNumber,
    totalTickets: tickets.length,
    serverSeed: raffle.serverSeed,
    clientSeed,
    combinedHash,
    serverSeedHash: raffle.serverSeedHash,
    message: 'Draw completed! The winner has been notified.',
  };
}
