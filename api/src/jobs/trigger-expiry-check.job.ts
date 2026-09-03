import { expireDrawTrigger, findExpiredPendingTriggers } from '../db/queries/draws.queries.js';
import { generateTriggerLink } from '../modules/draws/draws.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;

async function checkExpiredTriggers(): Promise<void> {
  try {
    const expiredTriggers = await findExpiredPendingTriggers();
    for (const trigger of expiredTriggers) {
      await expireDrawTrigger(trigger.id);
      // Scoped to just this one tier — every other tier's own trigger (if
      // any) is untouched.
      await generateTriggerLink(trigger.raffleId, trigger.tier, null, 'Previous one-time draw link expired');
      logger.info(`Expired draw link replaced for raffle ${trigger.raffleId} tier ${trigger.tier}`);
    }
  } catch (error) {
    logger.error('Trigger expiry check failed', error);
  }
}

export function startTriggerExpiryCheck(): void {
  logger.info(`Starting trigger expiry check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkExpiredTriggers, CHECK_INTERVAL_MS);
}
