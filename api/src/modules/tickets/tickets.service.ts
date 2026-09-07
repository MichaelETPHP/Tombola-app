import { nanoid } from 'nanoid';
import { listUserTickets } from '../../db/queries/tickets.queries.js';
import { reservePayment, updatePaymentStatus } from '../../db/queries/payments.queries.js';
import { chapaInitialize } from '../../lib/payment-gateway.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { PurchaseTicketsInput } from './tickets.schema.js';

function toChapaPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('251') && digits.length === 12
    ? `0${digits.slice(3)}`
    : digits.length === 9
      ? `0${digits}`
      : digits;

  if (!/^0[79]\d{8}$/.test(local)) {
    throw new AppError(400, 'A valid Ethiopian mobile number is required for payment');
  }
  return local;
}

/**
 * Initiate ticket purchase flow.
 * Validates raffle state, user limits, then creates a pending payment
 * and returns the payment gateway checkout URL.
 */
export async function purchaseTickets(
  raffleId: string,
  userId: string,
  userPhone: string,
  input: PurchaseTicketsInput
) {
  const txRef = `TXN-${nanoid(16)}`;
  const reservation = await reservePayment({
    userId,
    raffleId,
    gateway: input.paymentGateway,
    gatewayRef: txRef,
    ticketCount: input.quantity,
  });
  if (!reservation.ok) {
    if (reservation.reason === 'not_found') throw new AppError(404, 'raffle.notFound');
    if (reservation.reason === 'closed') throw new AppError(409, 'This raffle is no longer accepting ticket purchases');
    if (reservation.reason === 'raffle_limit') throw new AppError(409, `Only ${reservation.available ?? 0} tickets remain available`);
    if (reservation.reason === 'active_raffle_limit') throw new AppError(409, 'You can participate in up to 3 active raffles at a time');
    throw new AppError(409, `You can reserve only ${reservation.available ?? 0} more tickets for this raffle`);
  }
  const { payment, raffle } = reservation;
  const amount = payment.amount;

  if (input.paymentGateway === 'chapa') {
    try {
      const returnUrl = new URL('/payment-return', env.MOBILE_APP_URL);
      returnUrl.searchParams.set('payment_id', payment.id);
      returnUrl.searchParams.set('target', input.returnTarget);

      const chapaResult = await chapaInitialize({
        amount,
        currency: 'ETB',
        phone_number: toChapaPhoneNumber(userPhone),
        tx_ref: txRef,
        // Chapa invokes callback_url using GET. The callback re-queries
        // Chapa before any ticket can be issued.
        callback_url: `${env.API_BASE_URL}/payments/callback/chapa`,
        return_url: returnUrl.toString(),
        customization: {
          // Chapa only accepts letters, numbers, hyphens, underscores,
          // spaces, and dots here (and caps title around 16 chars) — kept
          // short and punctuation-free at the source; chapaInitialize
          // still sanitizes defensively since raffle.title is
          // admin-entered free text with no charset restriction of its own.
          title: 'YeneEta',
          description: `${input.quantity} ticket${input.quantity === 1 ? '' : 's'} for ${raffle.title}`,
        },
        mock: {
          raffleTitle: raffle.title,
          ticketCount: input.quantity,
          unitPrice: raffle.ticketPrice,
          callbackUrl: `${env.API_BASE_URL}/payments/webhook/chapa`,
        },
      });

      const checkoutUrl = chapaResult.data?.checkout_url;
      if (chapaResult.status !== 'success' || !checkoutUrl) {
        throw new Error('Chapa did not return a checkout URL');
      }
      if (!env.MOCK_PAYMENTS && new URL(checkoutUrl).protocol !== 'https:') {
        throw new Error('Chapa returned an insecure checkout URL');
      }

      return { paymentId: payment.id, checkoutUrl, txRef, amount, ticketCount: input.quantity };
    } catch (error) {
      // A failed gateway initialization must not reserve raffle inventory.
      await updatePaymentStatus(payment.id, 'failed');
      logger.error('Unable to initialize Chapa checkout', {
        paymentId: payment.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError(502, 'Payment service is temporarily unavailable');
    }
  }

  // Telebirr or other gateways — stub for now
  return {
    paymentId: payment.id,
    txRef,
    amount,
    ticketCount: input.quantity,
    message: `${input.paymentGateway} integration pending`,
  };
}

/**
 * Get all tickets for a user. Reshapes `purchasedAt` (the real column) to
 * `createdAt` to keep the API contract stable for the mobile app.
 */
export async function getUserTickets(userId: string) {
  const tickets = await listUserTickets(userId);
  return tickets.map((t) => ({
    id: t.id,
    raffleId: t.raffleId,
    ticketNumber: t.ticketNumber,
    ticketCode: t.ticketCode,
    createdAt: t.purchasedAt,
    raffleTitle: t.raffleTitle,
    // The raffle's own deadline — the closest real concept to a ticket's
    // "expiry" (once the raffle draws, that ticket's chance is resolved).
    expiresAt: t.raffleDeadlineAt,
    amount: t.ticketPrice,
  }));
}
