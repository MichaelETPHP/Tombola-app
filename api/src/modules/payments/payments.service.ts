import {
  findPaymentByTxRef,
  updatePaymentStatus,
} from '../../db/queries/payments.queries.js';
import { createTickets, getNextTicketNumber } from '../../db/queries/tickets.queries.js';
import { incrementTicketsSold } from '../../db/queries/raffles.queries.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/**
 * Process a successful payment webhook.
 * Idempotent: if the payment has already been processed, return early.
 */
export async function processPaymentSuccess(txRef: string): Promise<void> {
  // 1. Find the payment by transaction reference
  const payment = await findPaymentByTxRef(txRef);

  if (!payment) {
    logger.warn(`Webhook received for unknown tx_ref: ${txRef}`);
    throw new AppError(404, 'Payment not found');
  }

  // 2. Idempotency check — already processed?
  if (payment.status === 'completed') {
    logger.info(`Duplicate webhook for already-completed payment: ${txRef}`);
    return; // Already processed, no-op
  }

  if (payment.status !== 'pending') {
    logger.warn(`Webhook for payment in unexpected state: ${payment.status} (tx_ref: ${txRef})`);
    return;
  }

  // 3. Get next ticket number
  const startingNumber = await getNextTicketNumber(payment.raffleId);

  // 4. Create tickets
  await createTickets({
    raffleId: payment.raffleId,
    userId: payment.userId,
    count: payment.ticketCount,
    paymentId: payment.id,
    startingNumber,
  });

  // 5. Update tickets sold count on raffle
  await incrementTicketsSold(payment.raffleId, payment.ticketCount);

  // 6. Mark payment as completed
  await updatePaymentStatus(payment.id, 'completed');

  logger.info(
    `Payment completed: ${txRef} — ${payment.ticketCount} tickets issued for raffle ${payment.raffleId}`
  );
}

/**
 * Process a failed payment webhook.
 */
export async function processPaymentFailure(txRef: string): Promise<void> {
  const payment = await findPaymentByTxRef(txRef);

  if (!payment) {
    logger.warn(`Failure webhook for unknown tx_ref: ${txRef}`);
    return;
  }

  if (payment.status !== 'pending') {
    return; // Already processed
  }

  await updatePaymentStatus(payment.id, 'failed');
  logger.info(`Payment failed: ${txRef}`);
}
