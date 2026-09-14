import { sql } from '../../db/client.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { formatDisplayNumber } from '../../lib/ticket-display-number.js';

/**
 * Given the scrambled display number a customer/support conversation refers
 * to (e.g. "SAM-047213"), find which raw ticket_number (1..ticketCap) it
 * maps to — the inverse of formatDisplayNumber. There's no closed-form
 * inverse for the Feistel cipher here, so this just scans the raffle's own
 * (bounded, at most ticketCap) range — an admin-only, occasional lookup,
 * not a hot path.
 */
function findTicketNumberForDisplay(
  displayNumber: string,
  blockStart: number | null,
  numberSeed: number | null,
  ticketCap: number
): number | null {
  for (let n = 1; n <= ticketCap; n += 1) {
    if (formatDisplayNumber(blockStart, numberSeed, n, ticketCap) === displayNumber) return n;
  }
  return null;
}

export async function ticketInventory(raffleId: string, start: number, find?: string) {
  const [raffle] = await sql<{ ticketCap: number; publicCode: string; numberBlockStart: number | null; numberSeed: number | null }[]>`
    SELECT ticket_cap, public_code, number_block_start, number_seed FROM raffles WHERE id = ${raffleId}`;
  if (!raffle) throw new AppError(404, 'Raffle not found');

  let pageStart = start;
  if (find) {
    const matched = findTicketNumberForDisplay(find, raffle.numberBlockStart, raffle.numberSeed, raffle.ticketCap);
    if (matched === null) throw new AppError(404, 'No ticket with that number in this raffle.');
    pageStart = Math.floor((matched - 1) / 60) * 60 + 1;
  }

  const rows = await sql<{ number: number; state: string }[]>`SELECT n AS number,
    CASE WHEN c.sold THEN 'sold' WHEN c.payment_id IS NOT NULL AND (p.review_required OR
      (p.status = 'pending' AND (p.checkout_started_at IS NOT NULL OR p.reservation_expires_at > NOW()))) THEN 'held' ELSE 'available' END AS state
    FROM generate_series(${pageStart}::int, LEAST(${pageStart + 59}::int, ${raffle.ticketCap}::int)) n
    LEFT JOIN ticket_number_claims c ON c.raffle_id = ${raffleId} AND c.ticket_number = n
    LEFT JOIN payments p ON p.id = c.payment_id ORDER BY n`;
  const numbers = rows.map((row) => ({
    ...row,
    displayNumber: formatDisplayNumber(raffle.numberBlockStart, raffle.numberSeed, row.number, raffle.ticketCap),
  }));

  interface PendingPayment {
    id: string; selectedNumbers: number[]; amount: number; status: string;
    reviewRequired: boolean; checkoutStartedAt: string | null; reservationExpiresAt: string | null; createdAt: string;
  }
  const rawPayments = await sql<PendingPayment[]>`
    SELECT id, selected_numbers, amount, status, review_required, checkout_started_at, reservation_expires_at, created_at
    FROM payments WHERE raffle_id = ${raffleId} AND (status = 'pending' OR review_required)
    ORDER BY review_required DESC, created_at LIMIT 50`;
  const payments = rawPayments.map((payment) => ({
    ...payment,
    selectedDisplayNumbers: (payment.selectedNumbers ?? []).map((n) =>
      formatDisplayNumber(raffle.numberBlockStart, raffle.numberSeed, n, raffle.ticketCap)),
  }));

  return { ...raffle, numbers, payments, start: pageStart, end: Math.min(pageStart + 59, raffle.ticketCap) };
}

/** Records an externally completed refund. Does not call a refund gateway. */
export async function recordReviewedRefund(paymentId: string, adminId: string, reference: string) {
  await sql.begin(async (tx) => {
    const [snapshot] = await tx<{ raffleId: string }[]>`SELECT raffle_id FROM payments WHERE id = ${paymentId}`;
    if (!snapshot) throw new AppError(404, 'Payment not found');
    await tx`SELECT id FROM raffles WHERE id = ${snapshot.raffleId} FOR UPDATE`;
    const [payment] = await tx`SELECT id FROM payments WHERE id = ${paymentId} AND review_required FOR UPDATE`;
    if (!payment) throw new AppError(409, 'Only a verified payment awaiting review can be resolved here.');
    await tx`UPDATE payments SET status = 'refunded', review_required = false WHERE id = ${paymentId}`;
    await tx`DELETE FROM ticket_number_claims WHERE payment_id = ${paymentId} AND NOT sold`;
    await tx`INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES ('admin', ${adminId}, 'payment.external_refund_recorded', 'payment', ${paymentId}, ${tx.json({ reference })})`;
  });
}
