import {
  findRafflesAtCap,
  findRafflesPastDeadline,
  findRafflesReadyForDraw,
  lockRaffleForScheduledDraw,
} from '../db/queries/raffles.queries.js';
import { generateTriggerLink } from '../modules/draws/draws.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;
const overdueNotices = new Set<string>();

async function checkRaffles(): Promise<void> {
  try {
    for (const raffle of await findRafflesAtCap()) {
      await lockRaffleForScheduledDraw(raffle.id);
      logger.info(`Raffle ${raffle.id} reached quota; draw scheduled in 2 days`);
    }

    for (const raffle of await findRafflesReadyForDraw()) {
      await generateTriggerLink(raffle.id, null, 'Scheduled draw time reached; trigger selected automatically');
      logger.info(`Scheduled draw link generated for raffle ${raffle.id}`);
    }

    // Extension is always a recorded Platform Owner decision. Checkout has
    // already stopped because reservePayment rejects an expired deadline.
    for (const raffle of await findRafflesPastDeadline()) {
      if (!overdueNotices.has(raffle.id)) {
        logger.warn(`Raffle ${raffle.id} is below quota and awaiting an owner deadline extension`);
        overdueNotices.add(raffle.id);
      }
    }
  } catch (error) {
    logger.error('Raffle deadline check failed', error);
  }
}

export function startRaffleDeadlineCheck(): void {
  logger.info(`Starting raffle deadline check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkRaffles, CHECK_INTERVAL_MS);
  checkRaffles();
}
