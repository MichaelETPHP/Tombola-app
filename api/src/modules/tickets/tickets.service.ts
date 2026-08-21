import { nanoid } from 'nanoid';
import { findRaffleById } from '../../db/queries/raffles.queries.js';
import { countUserTicketsInRaffle, listUserTickets } from '../../db/queries/tickets.queries.js';
import { createPayment } from '../../db/queries/payments.queries.js';
import { chapaInitialize } from '../../lib/payment-gateway.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
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
  // 1. Check raffle exists and is open
  const raffle = await findRaffleById(raffleId);
  if (!raffle) {
    throw new AppError(404, 'Raffle not found');
  }
  if (raffle.status !== 'open') {
    throw new AppError(400, 'This raffle is no longer accepting ticket purchases');
  }

  // 2. Check ticket cap
  const remainingTickets = raffle.ticketCap - raffle.ticketsSold;
  if (input.quantity > remainingTickets) {
    throw new AppError(400, `Only ${remainingTickets} tickets remaining`);
  }

  // 3. Check per-user limit
  const userTicketCount = await countUserTicketsInRaffle(raffleId, userId);
  if (userTicketCount + input.quantity > raffle.maxTicketsPerUser) {
    const remaining = raffle.maxTicketsPerUser - userTicketCount;
    throw new AppError(
      400,
      `You can only purchase ${remaining} more ticket(s) for this raffle (limit: ${raffle.maxTicketsPerUser})`
    );
  }

  // 4. Calculate total amount
  const amount = raffle.ticketPrice * input.quantity;
  const txRef = `TXN-${nanoid(16)}`;

  // 5. Create pending payment record
  const payment = await createPayment({
    userId,
    raffleId,
    amount,
    currency: 'ETB',
    gateway: input.paymentGateway,
    gatewayTxRef: txRef,
    ticketCount: input.quantity,
  });

  // 6. Initialize payment with gateway
  if (input.paymentGateway === 'chapa') {
    const chapaResult = await chapaInitialize({
      amount,
      currency: 'ETB',
      phone_number: userPhone,
      tx_ref: txRef,
      callback_url: `${process.env.API_BASE_URL || 'http://localhost:3000'}/payments/webhook/chapa`,
      customization: {
        title: `Tombola: ${raffle.title}`,
        description: `${input.quantity} ticket(s) for "${raffle.title}"`,
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
 * Get all tickets for a user.
 */
export async function getUserTickets(userId: string) {
  return listUserTickets(userId);
}
