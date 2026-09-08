import {
  cancelPendingPayment,
  completePaymentAndIssueTickets,
  findPaymentByTxRef,
  findPaymentReceiptById,
  listUserPayments,
  updatePaymentStatus,
} from '../../db/queries/payments.queries.js';
import { env } from '../../config/env.js';
import { chapaVerify } from '../../lib/payment-gateway.js';
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
    ticketCodes: payment.ticketNumbers.map((number) => `${payment.raffleCode}-${String(number).padStart(5, '0')}`),
    amount: payment.amount,
    gateway: payment.gateway,
    txRef: payment.gatewayRef,
    status: payment.status,
    createdAt: payment.createdAt,
  };
}

/**
 * User backed out of checkout (tapped back/close before finishing). Only
 * ever touches a still-'pending' row — if it already resolved (a webhook
 * or verify call beat this request), that outcome stands untouched and no
 * ticket this raced against is ever clawed back. Callers should check the
 * returned status: a payment that turns out 'completed' here means the
 * user should land on their receipt instead of a "cancelled" message.
 */
export async function cancelPaymentForUser(id: string, userId: string) {
  const payment = await findPaymentReceiptById(id);
  if (!payment || payment.userId !== userId) throw new AppError(404, 'Payment not found');
  if (payment.status === 'pending') {
    await cancelPendingPayment(id);
  }
  return getPaymentStatus(id, userId);
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
    ticketCodes: payment.ticketNumbers.map((number) => `${payment.raffleCode}-${String(number).padStart(5, '0')}`),
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

function amountInCents(value: string | number): number | null {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Re-query Chapa and reconcile only authoritative transaction data.
 * Shared by the callback, signed webhook, and authenticated return page.
 */
export async function verifyAndReconcileChapaPayment(txRef: string): Promise<void> {
  const payment = await findPaymentByTxRef(txRef);
  if (!payment) throw new AppError(404, 'Payment not found');
  if (payment.gateway !== 'chapa') throw new AppError(409, 'Payment gateway mismatch');
  if (payment.status === 'completed' || payment.status === 'refunded') return;

  const verification = await chapaVerify(txRef);
  const data = verification.data;
  if (verification.status !== 'success' || !data) {
    throw new AppError(502, 'Unable to verify payment with Chapa');
  }

  const verifiedAmount = data.amount === undefined ? null : amountInCents(data.amount);
  const expectedAmount = amountInCents(payment.amount);
  const verifiedCurrency = data.currency?.toUpperCase();
  const verifiedMode = data.mode?.toLowerCase();

  if (
    data.tx_ref !== txRef
    || verifiedAmount === null
    || expectedAmount === null
    || verifiedAmount !== expectedAmount
    || verifiedCurrency !== 'ETB'
    || (verifiedMode && verifiedMode !== env.CHAPA_MODE)
  ) {
    logger.error('Chapa verification data did not match the reserved payment', {
      txRef,
      verifiedTxRef: data.tx_ref,
      expectedAmount,
      verifiedAmount,
      verifiedCurrency,
      verifiedMode,
    });
    throw new AppError(409, 'Verified payment details do not match the order');
  }

  const status = data.status?.toLowerCase();
  if (status === 'success') {
    await processPaymentSuccess(txRef);
  } else if (status && ['failed', 'cancelled', 'failed/cancelled'].includes(status)) {
    await processPaymentFailure(txRef);
  }
}

export async function verifyPaymentForUser(id: string, userId: string) {
  const payment = await findPaymentReceiptById(id);
  if (!payment || payment.userId !== userId) throw new AppError(404, 'Payment not found');
  if (payment.status === 'pending' && payment.gateway === 'chapa' && payment.gatewayRef) {
    await verifyAndReconcileChapaPayment(payment.gatewayRef);
  }
  return getPaymentStatus(id, userId);
}
