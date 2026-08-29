import { nanoid } from 'nanoid';
import { findExpiredPendingTriggers, expireDrawTrigger, createDrawTrigger } from '../db/queries/draws.queries.js';
import { listRaffleTickets } from '../db/queries/tickets.queries.js';
import { findUserById } from '../db/queries/users.queries.js';
import { sendTriggerLink } from '../lib/sms.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000; // Check every minute

/**
 * Check for expired trigger links and re-select a new trigger participant.
 *
 * When a trigger link expires without being clicked:
 * 1. Mark the trigger as expired
 * 2. Select a new random participant (a new draw_triggers row, attempt_number + 1)
 * 3. Send them a new trigger link
 *
 * The raffle stays in `awaiting_trigger` throughout — no status change needed.
 */
async function checkExpiredTriggers(): Promise<void> {
  try {
    const expiredTriggers = await findExpiredPendingTriggers();

    for (const trigger of expiredTriggers) {
      logger.info(`Trigger link expired for raffle ${trigger.raffleId} (attempt ${trigger.attemptNumber}) — re-selecting`);

      // 1. Mark as expired
      await expireDrawTrigger(trigger.id);

      // 2. Get raffle tickets (excluding the previous trigger user to avoid re-selecting)
      const tickets = await listRaffleTickets(trigger.raffleId);
      const eligibleTickets = tickets.filter((t: { userId: string }) => t.userId !== trigger.selectedUserId);
      const pool = eligibleTickets.length > 0 ? eligibleTickets : tickets;

      if (pool.length === 0) {
        logger.warn(`No eligible participants for re-selection in raffle ${trigger.raffleId}`);
        continue;
      }

      // 3. Random re-selection from the eligible pool
      const randomIndex = Math.floor(Math.random() * pool.length);
      const selectedTicket = pool[randomIndex];

      await createNewTrigger(trigger.raffleId, selectedTicket.userId, trigger.attemptNumber + 1);
    }
  } catch (error) {
    logger.error('Trigger expiry check failed', error);
  }
}

/**
 * Create a new trigger and send the link.
 */
async function createNewTrigger(raffleId: string, userId: string, attemptNumber: number): Promise<void> {
  const linkToken = nanoid(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await createDrawTrigger({
    raffleId,
    selectedUserId: userId,
    attemptNumber,
    linkToken,
    expiresAt,
  });

  const user = await findUserById(userId);
  if (user) {
    const link = `${process.env.API_BASE_URL || 'http://localhost:3435'}/draws/${linkToken}`;
    await sendTriggerLink(user.phoneNumber, link);
  }

  logger.info(`New trigger participant selected for raffle ${raffleId}: user ${userId} (attempt ${attemptNumber})`);
}

/**
 * Start the trigger expiry check job.
 */
export function startTriggerExpiryCheck(): void {
  logger.info(`Starting trigger expiry check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkExpiredTriggers, CHECK_INTERVAL_MS);
}
