import {
  completePaymentAndIssueTickets,
  findPaymentByTxRef,
  findPaymentReceiptById,
  listUserPayments,
  updatePaymentStatus,
} from '../../db/queries/payments.queries.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/** Atomically confirms a payment and assigns its ticket numbers. */
export async function processPaymentSuccess(txRef: string): Promise<void> {
  const result = await completePaymentAndIssueTickets(txRef);
  if (result === 'not_found') {
    logger.warn(`Webhook received for unknown tx_ref: ${txRef}`);
    throw new AppError(404, 'Payment not found');
  }
  if (result === 'already_processed') {
    logger.info(`Duplicate or late webhook ignored: ${txRef}`);
    return;
  }
  logger.info(`Payment completed and tickets issued atomically: ${txRef}`);
}

export async function getPaymentStatus(id: string, userId: string) {
  const payment = await findPaymentReceiptById(id);
  if (!payment || payment.userId !== userId) throw new AppError(404, 'Payment not found');
  return {
    id: payment.id,
    raffleId: payment.raffleId,
    raffleTitle: payment.raffleTitle,
    ticketCount: payment.ticketCount,
    ticketNumbers: payment.ticketNumbers,
    amount: payment.amount,
    gateway: payment.gateway,
    status: payment.status,
    createdAt: payment.createdAt,
  };
}

export async function getMyPayments(userId: string, limit = 50, offset = 0) {
  const payments = await listUserPayments(userId, limit, offset);
  return payments.map((payment) => ({
    id: payment.id,
    raffleId: payment.raffleId,
    raffleTitle: payment.raffleTitle,
    amount: payment.amount,
    ticketCount: payment.ticketCount,
    ticketNumbers: payment.ticketNumbers,
    status: payment.status,
    gateway: payment.gateway,
    createdAt: payment.createdAt,
  }));
}

export async function processPaymentFailure(txRef: string): Promise<void> {
  const payment = await findPaymentByTxRef(txRef);
  if (!payment) {
    logger.warn(`Failure webhook for unknown tx_ref: ${txRef}`);
    return;
  }
  if (payment.status !== 'pending') return;
  await updatePaymentStatus(payment.id, 'failed');
  logger.info(`Payment failed: ${txRef}`);
}
