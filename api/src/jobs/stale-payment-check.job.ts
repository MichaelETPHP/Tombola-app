import { findStalePendingChapaPayments, expirePendingPayments, markPaymentReviewRequired } from '../db/queries/payments.queries.js';
import { verifyAndReconcileChapaPayment } from '../modules/payments/payments.service.js';
import { ChapaVerifyError } from '../lib/payment-gateway.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000;
// Give Chapa's own webhook/callback a fair head start before actively
// re-querying on a payment's behalf. Shortened from 3 minutes — a USSD
// decline doesn't always reach us via webhook, and every minute a failed
// payment's numbers stay held is a minute someone else genuinely waiting
// online can't pick them. This costs nothing extra for a payment that's
// still legitimately in flight: verifying only ever acts on a definitive
// answer from Chapa, never infers failure from age alone.
const RECONCILE_AFTER_MS = 90_000;
// Unknown gateway outcomes remain pending; never infer a failed charge from age.
async function checkStalePayments(): Promise<void> {
  try {
    await expirePendingPayments();
    const stale = await findStalePendingChapaPayments(RECONCILE_AFTER_MS);
    for (const payment of stale) {
      try {
        await verifyAndReconcileChapaPayment(payment.gatewayRef!);
      } catch (error) {
        // 400/404 from Chapa means this tx_ref does not and will not exist
        // on their side — every future sweep would get the identical
        // answer forever (this is exactly what an admin Integrations-page
        // log review turned up: one payment retried on every single sweep
        // since creation, never resolving). 401/403/5xx stay untouched:
        // those can affect every pending payment at once (a credentials
        // problem or a Chapa outage), so a single payment being unlucky
        // enough to be checked during one is not evidence *it* is invalid.
        if (error instanceof ChapaVerifyError && (error.httpStatus === 400 || error.httpStatus === 404)) {
          logger.error(`Payment ${payment.id} (tx_ref ${payment.gatewayRef}) has a tx_ref Chapa does not recognize — marking for review instead of retrying forever`, error.message);
          await markPaymentReviewRequired(payment.id);
          continue;
        }
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
