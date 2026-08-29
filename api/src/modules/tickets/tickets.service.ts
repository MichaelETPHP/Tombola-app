import { nanoid } from 'nanoid';
import { listUserTickets } from '../../db/queries/tickets.queries.js';
import { reservePayment } from '../../db/queries/payments.queries.js';
import { chapaInitialize } from '../../lib/payment-gateway.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { env } from '../../config/env.js';
import type { PurchaseTicketsInput } from './tickets.schema.js';

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
    throw new AppError(409, `You can reserve only ${reservation.available ?? 0} more tickets for this raffle`);
  }
  const { payment, raffle } = reservation;
  const amount = payment.amount;

  if (input.paymentGateway === 'chapa') {
    const chapaResult = await chapaInitialize({
      amount,
      currency: 'ETB',
      phone_number: userPhone,
      tx_ref: txRef,
      callback_url: `${process.env.API_BASE_URL || 'http://localhost:3435'}/payments/webhook/chapa`,
      // Where Chapa sends the user's browser after they finish paying —
      // separate from callback_url, which is the server-to-server webhook
      // that actually issues the tickets (see payments.service.ts).
      return_url: `${env.MOBILE_APP_URL}/payments/${payment.id}`,
      customization: {
        title: `Tombola: ${raffle.title}`,
        description: `${input.quantity} ticket(s) for "${raffle.title}"`,
      },
      mock: {
        raffleTitle: raffle.title,
        ticketCount: input.quantity,
        unitPrice: raffle.ticketPrice,
      },
    });

    return {
      paymentId: payment.id,
      checkoutUrl: chapaResult.data?.checkout_url,
      txRef,
      amount,
      ticketCount: input.quantity,
    };
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
    createdAt: t.purchasedAt,
  }));
}
