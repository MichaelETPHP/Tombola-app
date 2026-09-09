import { sql } from '../../db/client.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

export async function ticketInventory(raffleId: string, start: number) {
  const [raffle] = await sql<{ ticketCap: number; publicCode: string }[]>`SELECT ticket_cap, public_code FROM raffles WHERE id = ${raffleId}`;
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const numbers = await sql<{ number: number; state: string }[]>`SELECT n AS number,
    CASE WHEN c.sold THEN 'sold' WHEN c.payment_id IS NOT NULL AND (p.review_required OR
      (p.status = 'pending' AND (p.checkout_started_at IS NOT NULL OR p.reservation_expires_at > NOW()))) THEN 'held' ELSE 'available' END AS state
    FROM generate_series(${start}::int, LEAST(${start + 59}::int, ${raffle.ticketCap}::int)) n
    LEFT JOIN ticket_number_claims c ON c.raffle_id = ${raffleId} AND c.ticket_number = n
    LEFT JOIN payments p ON p.id = c.payment_id ORDER BY n`;
  const payments = await sql`SELECT id, selected_numbers, amount, status, review_required, checkout_started_at, reservation_expires_at, created_at
    FROM payments WHERE raffle_id = ${raffleId} AND (status = 'pending' OR review_required)
    ORDER BY review_required DESC, created_at LIMIT 50`;
  return { ...raffle, numbers, payments, start, end: Math.min(start + 59, raffle.ticketCap) };
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
