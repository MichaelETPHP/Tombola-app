import { findExpiredPendingTriggers } from '../db/queries/draws.queries.js';
import { reassignDrawTrigger } from '../modules/draws/draws.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;

async function checkExpiredTriggers(): Promise<void> {
  let expiredTriggers;
  try {
    expiredTriggers = await findExpiredPendingTriggers();
  } catch (error) {
    logger.error('Trigger expiry check failed to load expired triggers', error);
    return;
  }

  for (const trigger of expiredTriggers) {
    try {
      // reassignDrawTrigger expires the stale row itself, then picks a
      // fresh eligible participant (excluding this one) and sends
      // immediately — scoped to just this one tier.
      await reassignDrawTrigger(trigger.raffleId, trigger.tier, null, 'Previous one-time draw link expired');
      logger.info(`Expired draw link replaced for raffle ${trigger.raffleId} tier ${trigger.tier}`);
    } catch (error) {
      // One tier's reassignment failing (e.g. a rare race with
      // auto-draw-trigger.job.ts's own concurrent attempt on the same
      // tier right as it flips from 'expired' to a fresh replacement —
      // see generateSecureLink's unique-violation handling) must never
      // block every OTHER expired trigger in this batch from being
      // reassigned. This used to be one try/catch around the whole loop,
      // so a single failure silently stalled the rest until the next 60s
      // cycle.
      logger.error(`Failed to reassign expired draw link for raffle ${trigger.raffleId} tier ${trigger.tier}`, error);
    }
  }
}

export function startTriggerExpiryCheck(): void {
  logger.info(`Starting trigger expiry check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkExpiredTriggers, CHECK_INTERVAL_MS);
}
