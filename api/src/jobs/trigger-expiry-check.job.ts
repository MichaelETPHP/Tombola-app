import { nanoid } from 'nanoid';
import { findExpiredPendingDraws, expireDraw, createDraw } from '../db/queries/draws.queries.js';
import { listRaffleTickets } from '../db/queries/tickets.queries.js';
import { findUserById } from '../db/queries/users.queries.js';
import { sendTriggerLink } from '../lib/sms.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000; // Check every minute

/**
 * Check for expired trigger links and re-select a new trigger participant.
 * 
 * When a trigger link expires without being clicked:
 * 1. Mark the draw as expired
 * 2. Select a new random participant
 * 3. Send them a new trigger link
 */
async function checkExpiredTriggers(): Promise<void> {
  try {
    const expiredDraws = await findExpiredPendingDraws();

    for (const draw of expiredDraws) {
      logger.info(`Trigger link expired for draw ${draw.id} (raffle ${draw.raffleId}) — re-selecting`);

      // 1. Mark as expired
      await expireDraw(draw.id);

      // 2. Get raffle tickets (excluding the previous trigger user to avoid re-selecting)
      const tickets = await listRaffleTickets(draw.raffleId);
      const eligibleTickets = tickets.filter((t: { userId: string }) => t.userId !== draw.triggerUserId);

      if (eligibleTickets.length === 0) {
        // If only one participant, re-select them
        if (tickets.length > 0) {
          const selectedTicket = tickets[0];
          await createNewTrigger(draw.raffleId, selectedTicket.userId);
        } else {
          logger.warn(`No eligible participants for re-selection in raffle ${draw.raffleId}`);
        }
        continue;
      }

      // 3. Random re-selection from eligible participants
      const randomIndex = Math.floor(Math.random() * eligibleTickets.length);
      const selectedTicket = eligibleTickets[randomIndex];

      await createNewTrigger(draw.raffleId, selectedTicket.userId);
    }
  } catch (error) {
    logger.error('Trigger expiry check failed', error);
  }
}

/**
 * Create a new trigger draw and send the link.
 */
async function createNewTrigger(raffleId: string, userId: string): Promise<void> {
  const triggerToken = nanoid(32);
  const triggerExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await createDraw({
    raffleId,
    triggerUserId: userId,
    triggerToken,
    triggerExpiresAt,
  });

  const user = await findUserById(userId);
  if (user) {
    const link = `${process.env.API_BASE_URL || 'http://localhost:3000'}/draws/${triggerToken}`;
    await sendTriggerLink(user.phone, link);
  }

  logger.info(`New trigger participant selected for raffle ${raffleId}: user ${userId}`);
}

/**
 * Start the trigger expiry check job.
 */
export function startTriggerExpiryCheck(): void {
  logger.info(`Starting trigger expiry check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkExpiredTriggers, CHECK_INTERVAL_MS);
}
