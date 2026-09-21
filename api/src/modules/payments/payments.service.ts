import {
  cancelPendingPayment,
  completePaymentAndIssueTickets,
  findPaymentByTxRef,
  findPaymentReceiptById,
  listUserPayments,
  listPaymentsNeedingReview,
  resolvePaymentReview as dbResolvePaymentReview,
  updatePaymentStatus,
  type ChapaPaymentMeta,
} from '../../db/queries/payments.queries.js';
import { env } from '../../config/env.js';
import { chapaVerify } from '../../lib/payment-gateway.js';
import { sendTicketPurchaseConfirmation } from '../../lib/sms.js';
import { formatDisplayNumber, getGlobalCipherKey } from '../../lib/ticket-display-number.js';
import { broadcastTicketsSold } from '../../lib/ticket-broadcast.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/** Atomically confirms a payment and assigns its ticket numbers. */
export async function processPaymentSuccess(txRef: string, meta?: ChapaPaymentMeta): Promise<void> {
  const result = await completePaymentAndIssueTickets(txRef, meta);
  if (result === 'not_found') {
    logger.warn(`Webhook received for unknown tx_ref: ${txRef}`);
    throw new AppError(404, 'Payment not found');
  }
  if (result === 'review') { logger.error(`Verified payment requires refund review: ${txRef}`); return; }
  if (result === 'already_processed') {
    logger.info(`Duplicate or late webhook ignored: ${txRef}`);
    return;
  }
  logger.info(`Payment completed and tickets issued atomically: ${txRef}`);
  notifyTicketPurchase(txRef);
}

/**
 * Best-effort side effects fired off after tickets are already issued —
 * an SMS confirmation and a live push to any admin ticket grid watching
 * this raffle. Never blocks or fails the purchase itself: a dropped SMS
 * isn't a dropped sale, and a dead/slow admin socket must never affect it
 * either (see broadcastTicketsSold).
 */
function notifyTicketPurchase(txRef: string): void {
  void (async () => {
    try {
      const payment = await findPaymentByTxRef(txRef);
      if (!payment) return;
      const receipt = await findPaymentReceiptById(payment.id);
      if (!receipt) return;

      broadcastTicketsSold(
        receipt.raffleId,
        receipt.ticketNumbers.map((number, index) => ({
          number,
          displayNumber: receipt.ticketDisplayNumbers[index],
        }))
      );

      const result = await sendTicketPurchaseConfirmation(receipt.phoneNumber, {
        raffleName: receipt.raffleTitle,
        ticketCodes: receipt.ticketDisplayNumbers.map((d) => `${receipt.categoryCode}-${d}`),
      });
      if (!result.success) {
        logger.error(`Ticket purchase SMS failed for tx_ref ${txRef}: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Ticket purchase SMS exception for tx_ref ${txRef}: ${error instanceof Error ? error.message : error}`);
    }
  })();
}

export async function getPaymentStatus(id: string, userId: string) {
  const payment = await findPaymentReceiptById(id);
  if (!payment || payment.userId !== userId) throw new AppError(404, 'Payment not found');
  const cipherKey = payment.numberBlockStart !== null ? await getGlobalCipherKey() : null;
  return {
    id: payment.id,
    raffleId: payment.raffleId,
    raffleTitle: payment.raffleTitle,
    selectedNumbers: payment.selectedNumbers,
    // Checkout shows this before any ticket is actually issued (tickets —
    // and therefore ticketCodes below — only exist once payment succeeds),
    // so the reserved numbers need their own preview pass here, using the
    // exact same formula createTickets will use to permanently store them.
    selectedDisplayNumbers: (payment.selectedNumbers ?? []).map((number) =>
      formatDisplayNumber(payment.numberBlockStart, cipherKey, number)
    ),
    expiresAt: payment.reservationExpiresAt,
    checkoutStarted: !!payment.checkoutStartedAt,
    serverTime: new Date().toISOString(),
    ticketCount: payment.ticketCount,
    ticketNumbers: payment.ticketNumbers,
    ticketCodes: payment.ticketDisplayNumbers.map((d) => `${payment.categoryCode}-${d}`),
    amount: payment.amount,
    gateway: payment.gateway,
    txRef: payment.gatewayRef,
    chapaReference: payment.chapaReference,
    paymentMethod: payment.paymentMethod,
    status: payment.reviewRequired ? 'review' : payment.status,
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
    ticketCodes: payment.ticketDisplayNumbers.map((d) => `${payment.categoryCode}-${d}`),
    status: payment.reviewRequired ? 'review' : payment.status,
    gateway: payment.gateway,
    chapaReference: payment.chapaReference,
    paymentMethod: payment.paymentMethod,
    createdAt: payment.createdAt,
  }));
}

export async function processPaymentFailure(txRef: string, meta?: ChapaPaymentMeta): Promise<void> {
  const payment = await findPaymentByTxRef(txRef);
  if (!payment) {
    logger.warn(`Failure webhook for unknown tx_ref: ${txRef}`);
    return;
  }
  if (payment.status !== 'pending') return;
  await updatePaymentStatus(payment.id, 'failed', meta);
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

  const meta: ChapaPaymentMeta = {
    chapaReference: data.reference ?? null,
    paymentMethod: data.payment_method ?? null,
  };

  const status = data.status?.toLowerCase();
  if (status === 'success') {
    await processPaymentSuccess(txRef, meta);
  } else if (status && ['failed', 'cancelled', 'failed/cancelled'].includes(status)) {
    await processPaymentFailure(txRef, meta);
  }
}

export async function verifyPaymentForUser(id: string, userId: string) {
  const payment = await findPaymentReceiptById(id);
  if (!payment || payment.userId !== userId) throw new AppError(404, 'Payment not found');
  if ((payment.status === 'pending' || payment.status === 'failed') && payment.gateway === 'chapa' && payment.gatewayRef) {
    await verifyAndReconcileChapaPayment(payment.gatewayRef);
  }
  return getPaymentStatus(id, userId);
}

/**
 * Payments verified as paid by the gateway but that couldn't issue their
 * reserved numbers — a real charge with nothing resolved yet. See
 * completePaymentAndIssueTickets for how a payment lands here, and
 * listPaymentsNeedingReview's own comment for why this queue exists at all.
 */
export async function getPaymentsNeedingReview(limit: number, offset: number) {
  return listPaymentsNeedingReview(limit, offset);
}

/**
 * Admin confirms this charge was handled outside the system (typically:
 * refunded through Chapa's own dashboard) and clears it from the queue.
 * Returns null if it was already resolved by someone else — the route
 * turns that into a 404 rather than silently double-processing it.
 */
export async function resolvePaymentReview(id: string, adminId: string, reference: string | null) {
  return dbResolvePaymentReview(id, adminId, reference);
}
