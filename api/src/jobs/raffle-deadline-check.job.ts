import { nanoid } from 'nanoid';
import {
  findRafflesAtCap,
  findRafflesPastDeadline,
  updateRaffleStatus,
  extendRaffleDeadline,
} from '../db/queries/raffles.queries.js';
import { listRaffleTickets } from '../db/queries/tickets.queries.js';
import { createDraw } from '../db/queries/draws.queries.js';
import { sendTriggerLink } from '../lib/sms.js';
import { findUserById } from '../db/queries/users.queries.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000; // Check every minute

/**
 * Select a random ticket holder as the trigger participant.
 */
async function selectTriggerParticipant(raffleId: string): Promise<void> {
  const tickets = await listRaffleTickets(raffleId);
  if (tickets.length === 0) {
    logger.warn(`No tickets found for raffle ${raffleId} — cannot select trigger participant`);
    return;
  }

  // Random selection
  const randomIndex = Math.floor(Math.random() * tickets.length);
  const selectedTicket = tickets[randomIndex];

  // Create trigger token and draw record
  const triggerToken = nanoid(32);
  const triggerExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await createDraw({
    raffleId,
    triggerUserId: selectedTicket.userId,
    triggerToken,
    triggerExpiresAt,
  });

  // Send trigger link via SMS
  const user = await findUserById(selectedTicket.userId);
  if (user) {
    const link = `${process.env.API_BASE_URL || 'http://localhost:3000'}/draws/${triggerToken}`;
    await sendTriggerLink(user.phone, link);
  }

  // Update raffle status to "drawing"
  await updateRaffleStatus(raffleId, 'drawing');

  logger.info(
    `Trigger participant selected for raffle ${raffleId}: user ${selectedTicket.userId}, ticket #${selectedTicket.ticketNumber}`
  );
}

/**
 * Check all open raffles for cap/deadline conditions.
 *
 * State machine logic:
 * - Cap hit within deadline → lock raffle, select trigger participant
 * - Deadline passed without cap → extend deadline by original deadline_days
 */
async function checkRaffles(): Promise<void> {
  try {
    // 1. Check raffles that hit their ticket cap
    const cappedRaffles = await findRafflesAtCap();
    for (const raffle of cappedRaffles) {
      logger.info(`Raffle ${raffle.id} hit ticket cap (${raffle.ticketsSold}/${raffle.ticketCap}) — locking`);
      await updateRaffleStatus(raffle.id, 'locked');
      await selectTriggerParticipant(raffle.id);
    }

    // 2. Check raffles past their deadline
    const overdueRaffles = await findRafflesPastDeadline();
    for (const raffle of overdueRaffles) {
      // Extend deadline by original deadline_days
      const newDeadline = new Date();
      newDeadline.setDate(newDeadline.getDate() + raffle.deadlineDays);

      logger.info(
        `Raffle ${raffle.id} past deadline (extension #${raffle.extensionCount + 1}) — extending to ${newDeadline.toISOString()}`
      );
      await extendRaffleDeadline(raffle.id, newDeadline);
    }
  } catch (error) {
    logger.error('Raffle deadline check failed', error);
  }
}

/**
 * Start the raffle deadline check job.
 */
export function startRaffleDeadlineCheck(): void {
  logger.info(`Starting raffle deadline check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkRaffles, CHECK_INTERVAL_MS);
  // Run immediately on startup
  checkRaffles();
}
