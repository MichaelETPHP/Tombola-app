import { findStalePendingChapaPayments, expireUnstartedPayments } from '../db/queries/payments.queries.js';
import { verifyAndReconcileChapaPayment } from '../modules/payments/payments.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;
// Give Chapa's own webhook/callback a fair head start before actively
// re-querying on a payment's behalf.
const RECONCILE_AFTER_MS = 3 * 60_000;
// Unknown gateway outcomes remain pending; never infer a failed charge from age.
async function checkStalePayments(): Promise<void> {
  try {
    await expireUnstartedPayments();
    const stale = await findStalePendingChapaPayments(RECONCILE_AFTER_MS);
    for (const payment of stale) {
      try {
        await verifyAndReconcileChapaPayment(payment.gatewayRef!);
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
