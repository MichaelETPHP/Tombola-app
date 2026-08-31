import { sql } from '../client.js';
import type { DbRaffle } from './raffles.queries.js';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentGateway = 'chapa' | 'telebirr' | 'manual';

export interface DbPayment {
  id: string;
  userId: string;
  raffleId: string;
  ticketCount: number;
  amount: number;
  gateway: PaymentGateway;
  gatewayRef: string | null;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a payment record (status = pending).
 */
export async function createPayment(data: {
  userId: string;
  raffleId: string;
  amount: number;
  gateway: PaymentGateway;
  gatewayRef: string;
  ticketCount: number;
}): Promise<DbPayment> {
  const rows = await sql<DbPayment[]>`
    INSERT INTO payments (
      user_id, raffle_id, amount, status, gateway, gateway_ref, ticket_count
    ) VALUES (
      ${data.userId}, ${data.raffleId}, ${data.amount}, 'pending',
      ${data.gateway}, ${data.gatewayRef}, ${data.ticketCount}
    )
    RETURNING *
  `;
  return rows[0];
}

export type PaymentReservationResult =
  | { ok: true; payment: DbPayment; raffle: DbRaffle }
  | { ok: false; reason: 'not_found' | 'closed' | 'raffle_limit' | 'user_limit' | 'active_raffle_limit'; available?: number };

/**
 * Atomically reserves checkout capacity for 15 minutes. The raffle row lock
 * serializes concurrent buyers, preventing pending checkouts from overselling
 * the quota before gateway webhooks create the actual tickets.
 */
export async function reservePayment(data: {
  userId: string;
  raffleId: string;
  gateway: PaymentGateway;
  gatewayRef: string;
  ticketCount: number;
}): Promise<PaymentReservationResult> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${data.userId}`}))`;
    await tx`
      UPDATE payments SET status = 'failed', updated_at = NOW()
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes'
    `;

    const [raffle] = await tx<DbRaffle[]>`
      SELECT r.*, (SELECT COUNT(*)::int FROM tickets t WHERE t.raffle_id = r.id) AS tickets_sold
      FROM raffles r WHERE r.id = ${data.raffleId} FOR UPDATE
    `;
    if (!raffle) return { ok: false as const, reason: 'not_found' as const };
    if (raffle.status !== 'open' || raffle.deadlineAt <= new Date()) {
      return { ok: false as const, reason: 'closed' as const };
    }

    const [participation] = await tx<{ alreadyJoined: boolean; activeCount: number }[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM tickets WHERE user_id = ${data.userId} AND raffle_id = ${data.raffleId}
          UNION ALL
          SELECT 1 FROM payments WHERE user_id = ${data.userId} AND raffle_id = ${data.raffleId}
            AND status = 'pending' AND created_at >= NOW() - INTERVAL '15 minutes'
        ) AS already_joined,
        (SELECT COUNT(DISTINCT active.raffle_id)::int FROM (
          SELECT t.raffle_id FROM tickets t JOIN raffles ar ON ar.id = t.raffle_id
          WHERE t.user_id = ${data.userId} AND ar.status IN ('open', 'locked', 'awaiting_trigger', 'drawing')
          UNION
          SELECT p.raffle_id FROM payments p JOIN raffles ar ON ar.id = p.raffle_id
          WHERE p.user_id = ${data.userId} AND p.status = 'pending'
            AND p.created_at >= NOW() - INTERVAL '15 minutes'
            AND ar.status IN ('open', 'locked', 'awaiting_trigger', 'drawing')
        ) active) AS active_count
    `;
    if (!participation.alreadyJoined && participation.activeCount >= 3) {
      return { ok: false as const, reason: 'active_raffle_limit' as const };
    }

    const [reserved] = await tx<{ raffleReserved: number; userReserved: number; userOwned: number }[]>`
      SELECT
        COALESCE(SUM(ticket_count) FILTER (WHERE raffle_id = ${data.raffleId}), 0)::int AS raffle_reserved,
        COALESCE(SUM(ticket_count) FILTER (WHERE raffle_id = ${data.raffleId} AND user_id = ${data.userId}), 0)::int AS user_reserved,
        (SELECT COUNT(*)::int FROM tickets WHERE raffle_id = ${data.raffleId} AND user_id = ${data.userId}) AS user_owned
      FROM payments
      WHERE status = 'pending' AND created_at >= NOW() - INTERVAL '15 minutes'
    `;

    const raffleAvailable = raffle.ticketCap - raffle.ticketsSold - reserved.raffleReserved;
    if (data.ticketCount > raffleAvailable) {
      return { ok: false as const, reason: 'raffle_limit' as const, available: Math.max(0, raffleAvailable) };
    }
    const userAvailable = raffle.maxTicketsPerUser - reserved.userOwned - reserved.userReserved;
    if (data.ticketCount > userAvailable) {
      return { ok: false as const, reason: 'user_limit' as const, available: Math.max(0, userAvailable) };
    }

    const [payment] = await tx<DbPayment[]>`
      INSERT INTO payments (user_id, raffle_id, amount, status, gateway, gateway_ref, ticket_count)
      VALUES (${data.userId}, ${data.raffleId}, ${raffle.ticketPrice * data.ticketCount}, 'pending', ${data.gateway}, ${data.gatewayRef}, ${data.ticketCount})
      RETURNING *
    `;
    return { ok: true as const, payment, raffle };
  });
}

export async function completePaymentAndIssueTickets(gatewayRef: string): Promise<'completed' | 'already_processed' | 'not_found'> {
  return sql.begin(async (tx) => {
    const [payment] = await tx<DbPayment[]>`
      SELECT * FROM payments WHERE gateway_ref = ${gatewayRef} FOR UPDATE
    `;
    if (!payment) return 'not_found' as const;
    if (payment.status !== 'pending') return 'already_processed' as const;

    await tx`SELECT id FROM raffles WHERE id = ${payment.raffleId} FOR UPDATE`;
    const [next] = await tx<{ nextNumber: number }[]>`
      SELECT COALESCE(MAX(ticket_number), 0)::int + 1 AS next_number
      FROM tickets WHERE raffle_id = ${payment.raffleId}
    `;
    await tx`
      INSERT INTO tickets (raffle_id, user_id, ticket_number, payment_id)
      SELECT ${payment.raffleId}, ${payment.userId}, ${next.nextNumber} + series.n, ${payment.id}
      FROM generate_series(0, ${payment.ticketCount - 1}) AS series(n)
    `;
    await tx`UPDATE payments SET status = 'completed', updated_at = NOW() WHERE id = ${payment.id}`;
    return 'completed' as const;
  });
}

/**
 * Find a payment by gateway transaction reference.
 * Used for idempotent webhook processing.
 */
export async function findPaymentByTxRef(gatewayRef: string): Promise<DbPayment | null> {
  const rows = await sql<DbPayment[]>`
    SELECT * FROM payments
    WHERE gateway_ref = ${gatewayRef}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Find a payment by ID.
 */
export async function findPaymentById(id: string): Promise<DbPayment | null> {
  const rows = await sql<DbPayment[]>`
    SELECT * FROM payments WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface DbPaymentReceipt extends DbPayment {
  raffleTitle: string;
  raffleCode: string;
  ticketNumbers: number[];
}

/** Payment status plus the receipt data shown after confirmation. */
export async function findPaymentReceiptById(id: string): Promise<DbPaymentReceipt | null> {
  const rows = await sql<DbPaymentReceipt[]>`
    SELECT
      p.*,
      r.title AS raffle_title,
      r.public_code AS raffle_code,
      COALESCE(
        array_agg(t.ticket_number ORDER BY t.ticket_number)
          FILTER (WHERE t.ticket_number IS NOT NULL),
        ARRAY[]::int[]
      ) AS ticket_numbers
    FROM payments p
    JOIN raffles r ON r.id = p.raffle_id
    LEFT JOIN tickets t ON t.payment_id = p.id
    WHERE p.id = ${id}
    GROUP BY p.id, r.title
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Update payment status.
 */
export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus
): Promise<DbPayment | null> {
  const rows = await sql<DbPayment[]>`
    UPDATE payments
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export interface DbPaymentWithDetails {
  id: string;
  raffleId: string;
  raffleTitle: string;
  raffleCode: string;
  amount: number;
  ticketCount: number;
  /** The actual ticket numbers issued for this payment — empty until the webhook lands. */
  ticketNumbers: number[];
  status: PaymentStatus;
  gateway: PaymentGateway;
  createdAt: Date;
}

/**
 * List a user's payments, each with its raffle title and the actual ticket
 * numbers it issued (empty array for pending/failed payments, since no
 * tickets exist yet). One query rather than N+1 — aggregates tickets per
 * payment via array_agg.
 */
export async function listUserPayments(
  userId: string,
  limit: number,
  offset: number
): Promise<DbPaymentWithDetails[]> {
  return sql<DbPaymentWithDetails[]>`
    SELECT
      p.id,
      p.raffle_id,
      r.title AS raffle_title,
      r.public_code AS raffle_code,
      p.amount,
      p.ticket_count,
      p.status,
      p.gateway,
      p.created_at,
      COALESCE(
        array_agg(t.ticket_number ORDER BY t.ticket_number) FILTER (WHERE t.ticket_number IS NOT NULL),
        ARRAY[]::int[]
      ) AS ticket_numbers
    FROM payments p
    JOIN raffles r ON r.id = p.raffle_id
    LEFT JOIN tickets t ON t.payment_id = p.id
    WHERE p.user_id = ${userId}
    GROUP BY p.id, r.title
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
