import { sql } from '../client.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { ticketDisplayNumber } from '../../lib/ticket-display-number.js';

export async function getTicketAvailability(raffleId: string, userId: string, start: number, limit: number) {
  const [raffle] = await sql<{ ticketCap: number; maxTicketsPerUser: number; status: string; salesEnabled: boolean; isDemo: boolean; deadlineAt: Date; numberSeed: number | null }[]>`
    SELECT ticket_cap, max_tickets_per_user, status, sales_enabled, is_demo, deadline_at, number_seed FROM raffles WHERE id = ${raffleId} AND status <> 'draft'`;
  if (!raffle) throw new AppError(404, 'Raffle not found');
  if (start > raffle.ticketCap) throw new AppError(400, 'This number is outside the raffle range.');
  const rows = await sql<{ number: number; state: 'available' | 'sold' | 'owned' | 'held' | 'held_by_you' }[]>`
    SELECT n AS number, CASE WHEN c.sold THEN CASE WHEN p.user_id = ${userId} THEN 'owned' ELSE 'sold' END
      WHEN c.payment_id IS NOT NULL AND p.status = 'pending' AND
        (p.checkout_started_at IS NOT NULL OR p.reservation_expires_at > NOW() OR p.review_required)
        THEN CASE WHEN p.user_id = ${userId} THEN 'held_by_you' ELSE 'held' END
      WHEN p.review_required THEN 'held'
      ELSE 'available' END AS state
    FROM generate_series(${start}::int, LEAST(${start + limit - 1}::int, ${raffle.ticketCap}::int)) n
    LEFT JOIN ticket_number_claims c ON c.raffle_id = ${raffleId} AND c.ticket_number = n
    LEFT JOIN payments p ON p.id = c.payment_id ORDER BY n`;
  // The internal `number` (1..ticketCap) stays exactly what everything else
  // in this file already validates/reserves against — `displayNumber` is
  // purely what the client renders and searches by. See
  // ticket-display-number.ts for why a null seed leaves it unchanged.
  const numbers = rows.map((row) => ({ ...row, displayNumber: ticketDisplayNumber(raffle.numberSeed, row.number) }));
  const [usage] = await sql<{ owned: number; held: number }[]>`SELECT
    (SELECT COUNT(*)::int FROM tickets WHERE raffle_id = ${raffleId} AND user_id = ${userId}) AS owned,
    (SELECT COALESCE(SUM(ticket_count), 0)::int FROM payments WHERE raffle_id = ${raffleId} AND user_id = ${userId}
      AND status = 'pending' AND (checkout_started_at IS NOT NULL OR reservation_expires_at > NOW() OR review_required)) AS held`;
  const [active] = await sql<{ id: string; checkoutStartedAt: Date | null }[]>`SELECT id, checkout_started_at FROM payments
    WHERE raffle_id = ${raffleId} AND user_id = ${userId} AND status = 'pending'
    AND (checkout_started_at IS NOT NULL OR reservation_expires_at > NOW() OR review_required) ORDER BY created_at LIMIT 1`;
  return {
    numbers, start, end: Math.min(start + limit - 1, raffle.ticketCap), ticketCap: raffle.ticketCap,
    allowance: Math.max(0, Math.min(4, raffle.maxTicketsPerUser - usage.owned - usage.held)),
    owned: usage.owned, activePaymentId: active?.id ?? null, paymentStarted: !!active?.checkoutStartedAt,
    salesOpen: raffle.status === 'open' && raffle.salesEnabled && !raffle.isDemo && raffle.deadlineAt > new Date(),
    serverTime: new Date().toISOString(),
  };
}

