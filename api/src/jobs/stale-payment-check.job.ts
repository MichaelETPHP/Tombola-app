import { findStalePendingChapaPayments, updatePaymentStatus } from '../db/queries/payments.queries.js';
import { verifyAndReconcileChapaPayment } from '../modules/payments/payments.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;
// Give Chapa's own webhook/callback a fair head start before actively
// re-querying on a payment's behalf.
const RECONCILE_AFTER_MS = 3 * 60_000;
// Matches reservePayment's own cutoff (payments.queries.ts) — once a
// pending payment is this old, its ticket reservation is no longer being
// held for it anyway, so there is nothing left to reconcile it against.
const FORCE_FAIL_AFTER_MS = 15 * 60_000;

/**
 * Without this job, an abandoned Chapa checkout only resolves out of
 * 'pending' when the user's own receipt page happens to poll it, or as a
 * side effect of some OTHER user starting a new checkout anywhere on the
 * platform (reservePayment's opportunistic cleanup). Neither is bounded in
 * time. This sweep makes "ticket issued, or payment failed — never stuck
 * on Processing" true on a fixed schedule instead of by luck.
 */
async function checkStalePayments(): Promise<void> {
  try {
    const stale = await findStalePendingChapaPayments(RECONCILE_AFTER_MS);
    for (const payment of stale) {
      try {
        if (Date.now() - payment.createdAt.getTime() >= FORCE_FAIL_AFTER_MS) {
          await updatePaymentStatus(payment.id, 'failed');
          logger.info(`Stale pending payment auto-failed past the reservation window: ${payment.gatewayRef}`);
        } else {
          await verifyAndReconcileChapaPayment(payment.gatewayRef!);
        }
      } catch (error) {
        logger.error(`Stale payment reconciliation failed for ${payment.gatewayRef}`, error);
      }
    }
  } catch (error) {
    logger.error('Stale payment check failed', error);
  }
}

export function startStalePaymentCheck(): void {
  logger.info(`Starting stale payment check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkStalePayments, CHECK_INTERVAL_MS);
}
