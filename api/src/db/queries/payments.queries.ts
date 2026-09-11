import { sql } from '../client.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { sameSelection } from '../../modules/tickets/selection.js';
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
  selectedNumbers: number[] | null;
  reservationExpiresAt: Date | null;
  checkoutStartedAt: Date | null;
  idempotencyKey: string | null;
  reviewRequired: boolean;
}

export type PaymentReservationResult =
  | { ok: true; payment: DbPayment; raffle: DbRaffle }
  | { ok: false; reason: 'not_found' | 'closed' | 'sales_disabled' | 'demo' | 'raffle_limit' | 'user_limit' | 'active_raffle_limit'; available?: number };

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
  selectedNumbers?: number[];
  idempotencyKey?: string;
}): Promise<PaymentReservationResult> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${data.userId}`}))`;
    const [raffle] = await tx<DbRaffle[]>`
      SELECT r.*, (SELECT COUNT(*)::int FROM tickets t WHERE t.raffle_id = r.id) AS tickets_sold
      FROM raffles r WHERE r.id = ${data.raffleId} FOR UPDATE
    `;
    if (!raffle) return { ok: false as const, reason: 'not_found' as const };
    if (data.idempotencyKey) {
      const [existing] = await tx<DbPayment[]>`SELECT * FROM payments WHERE user_id = ${data.userId} AND idempotency_key = ${data.idempotencyKey}`;
      if (existing) {
        if (existing.raffleId !== data.raffleId || existing.gateway !== data.gateway || !sameSelection(existing.selectedNumbers ?? [], data.selectedNumbers ?? [])) {
          throw new AppError(409, 'This checkout request was already used for a different selection.', { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return { ok: true as const, payment: existing, raffle };
      }
    }
    // Only unstarted checkouts expire automatically. Once payment is exposed,
    // retain its exact numbers until the gateway gives an authoritative result.
    await tx`UPDATE payments SET status = 'failed' WHERE raffle_id = ${data.raffleId}
      AND status = 'pending' AND checkout_started_at IS NULL AND reservation_expires_at <= NOW()`;
    await tx`DELETE FROM ticket_number_claims c USING payments p WHERE c.payment_id = p.id
      AND c.raffle_id = ${data.raffleId} AND NOT c.sold AND p.status IN ('failed', 'refunded') AND NOT p.review_required`;
    const [active] = await tx<DbPayment[]>`SELECT * FROM payments WHERE raffle_id = ${data.raffleId}
      AND user_id = ${data.userId} AND status = 'pending' LIMIT 1`;
    if (active) throw new AppError(409, 'You already have a checkout for this raffle. Resume it before choosing more numbers.', { code: 'ACTIVE_CHECKOUT', paymentId: active.id });
    // These checks share the raffle row lock with an admin's sales toggle.
    // A demo never reserves a payment, including in mock-payment deployments.
    // Missing columns preserve the pre-migration behavior for existing raffles.
    if (raffle.isDemo === true) return { ok: false as const, reason: 'demo' as const };
    if (raffle.salesEnabled === false) return { ok: false as const, reason: 'sales_disabled' as const };
    if (raffle.status !== 'open' || raffle.deadlineAt <= new Date()) {
      return { ok: false as const, reason: 'closed' as const };
    }

    const [participation] = await tx<{ alreadyJoined: boolean; activeCount: number }[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM tickets WHERE user_id = ${data.userId} AND raffle_id = ${data.raffleId}
          UNION ALL
          SELECT 1 FROM payments WHERE user_id = ${data.userId} AND raffle_id = ${data.raffleId}
            AND status = 'pending'
        ) AS already_joined,
        (SELECT COUNT(DISTINCT active.raffle_id)::int FROM (
          SELECT t.raffle_id FROM tickets t JOIN raffles ar ON ar.id = t.raffle_id
          WHERE t.user_id = ${data.userId} AND ar.status IN ('open', 'locked', 'awaiting_trigger', 'drawing')
          UNION
          SELECT p.raffle_id FROM payments p JOIN raffles ar ON ar.id = p.raffle_id
          WHERE p.user_id = ${data.userId} AND p.status = 'pending'
            
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
      WHERE status = 'pending'
    `;

    const raffleAvailable = raffle.ticketCap - raffle.ticketsSold - reserved.raffleReserved;
    if (data.ticketCount > raffleAvailable) {
      return { ok: false as const, reason: 'raffle_limit' as const, available: Math.max(0, raffleAvailable) };
    }
    const userAvailable = raffle.maxTicketsPerUser - reserved.userOwned - reserved.userReserved;
    if (data.ticketCount > userAvailable) {
      return { ok: false as const, reason: 'user_limit' as const, available: Math.max(0, userAvailable) };
    }

    let selectedNumbers = data.selectedNumbers;
    if (!selectedNumbers) {
      const free = await tx<{ number: number }[]>`SELECT n AS number FROM generate_series(1, ${raffle.ticketCap}) n
        WHERE NOT EXISTS (SELECT 1 FROM ticket_number_claims c WHERE c.raffle_id = ${data.raffleId} AND c.ticket_number = n)
        ORDER BY n LIMIT ${data.ticketCount}`;
      selectedNumbers = free.map((row) => row.number);
    }
    if (selectedNumbers.length !== data.ticketCount || new Set(selectedNumbers).size !== selectedNumbers.length || selectedNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > raffle.ticketCap)) {
      throw new AppError(400, 'Choose valid, distinct numbers within this raffle.', { code: 'INVALID_TICKET_NUMBER' });
    }
    const conflicts = await tx<{ ticketNumber: number }[]>`SELECT ticket_number FROM ticket_number_claims
      WHERE raffle_id = ${data.raffleId} AND ticket_number = ANY(${selectedNumbers}::int[])`;
    if (conflicts.length) throw new AppError(409, 'Some numbers are no longer available. Choose replacements and continue.', {
      code: 'NUMBER_UNAVAILABLE', numbers: conflicts.map((row) => row.ticketNumber),
    });
    const [payment] = await tx<DbPayment[]>`
      INSERT INTO payments (user_id, raffle_id, amount, status, gateway, gateway_ref, ticket_count, selected_numbers, reservation_expires_at, idempotency_key)
      VALUES (${data.userId}, ${data.raffleId}, ${raffle.ticketPrice * data.ticketCount}, 'pending', ${data.gateway}, ${data.gatewayRef}, ${data.ticketCount},
        ${selectedNumbers}::int[], NOW() + INTERVAL '15 minutes', ${data.idempotencyKey ?? null}) RETURNING *
    `;
    await tx`INSERT INTO ticket_number_claims (raffle_id, ticket_number, payment_id)
      SELECT ${data.raffleId}, unnest(${selectedNumbers}::int[]), ${payment.id}`;
    return { ok: true as const, payment, raffle };
  });
}

export async function completePaymentAndIssueTickets(gatewayRef: string): Promise<'completed' | 'already_processed' | 'not_found' | 'review'> {
  return sql.begin(async (tx) => {
    const [snapshot] = await tx<DbPayment[]>`SELECT * FROM payments WHERE gateway_ref = ${gatewayRef}`;
    if (!snapshot) return 'not_found' as const;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${snapshot.userId}`}))`;
    const [raffle] = await tx<{ status: string }[]>`SELECT status FROM raffles WHERE id = ${snapshot.raffleId} FOR UPDATE`;
    const [payment] = await tx<DbPayment[]>`SELECT * FROM payments WHERE id = ${snapshot.id} FOR UPDATE`;
    if (payment.status === 'completed' || payment.status === 'refunded') return 'already_processed' as const;
    if (payment.reviewRequired) return 'review' as const;
    const claims = await tx<{ ticketNumber: number }[]>`SELECT ticket_number FROM ticket_number_claims WHERE payment_id = ${payment.id} AND NOT sold`;
    // A released or closed order may still receive a late verified charge.
    // Keep it visible for an audited refund; never silently replace numbers.
    if (payment.status !== 'pending' || !['open', 'locked'].includes(raffle.status) ||
        !sameSelection(claims.map((c) => c.ticketNumber), payment.selectedNumbers ?? []) || claims.length !== payment.ticketCount ||
        (!payment.checkoutStartedAt && payment.reservationExpiresAt && payment.reservationExpiresAt <= new Date())) {
      await tx`UPDATE payments SET review_required = true WHERE id = ${payment.id}`;
      await tx`INSERT INTO audit_log (actor_type, action, entity_type, entity_id, metadata)
        VALUES ('system', 'payment.requires_review', 'payment', ${payment.id}, ${tx.json({ reason: 'Verified charge could not fulfill the reserved numbers' })})`;
      return 'review' as const;
    }
    await tx`INSERT INTO tickets (raffle_id, user_id, ticket_number, payment_id)
      SELECT ${payment.raffleId}, ${payment.userId}, unnest(${payment.selectedNumbers!}::int[]), ${payment.id}`;
    await tx`UPDATE payments SET status = 'completed' WHERE id = ${payment.id}`;
    return 'completed' as const;
  });
}

/** Mark a checkout in flight before exposing any gateway charge UI. */
export async function startPaymentCheckout(id: string, userId: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [p] = await tx<DbPayment[]>`SELECT * FROM payments WHERE id = ${id} AND user_id = ${userId}`;
    if (!p) throw new AppError(404, 'Payment not found');
    await tx`SELECT id FROM raffles WHERE id = ${p.raffleId} FOR UPDATE`;
    const [payment] = await tx<DbPayment[]>`SELECT * FROM payments WHERE id = ${id} FOR UPDATE`;
    if (payment.status !== 'pending' || payment.reviewRequired) throw new AppError(409, 'This payment is no longer available. Check its status.');
    if (!payment.checkoutStartedAt && payment.reservationExpiresAt && payment.reservationExpiresAt <= new Date()) throw new AppError(409, 'Your reservation expired. Choose your numbers again.');
    await tx`UPDATE payments SET checkout_started_at = COALESCE(checkout_started_at, NOW()) WHERE id = ${id}`;
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
 * Pending Chapa payments old enough that Chapa's webhook/callback has had
 * a fair chance to arrive on its own — candidates for the background
 * reconciliation sweep, not something a normal user-facing query needs.
 */
export async function findStalePendingChapaPayments(olderThanMs: number): Promise<DbPayment[]> {
  return sql<DbPayment[]>`
    SELECT * FROM payments
    WHERE status = 'pending' AND NOT review_required AND gateway = 'chapa' AND gateway_ref IS NOT NULL
      AND created_at < NOW() - (${olderThanMs} || ' milliseconds')::interval
  `;
}

/**
 * Pulls a payment out of the stale-payment sweep for good — used when
 * Chapa itself says a tx_ref will never verify (400/404: not "try again
 * later", but "this reference doesn't exist"), so it stops being retried
 * every sweep forever and instead surfaces in the admin refund-review
 * queue like any other unresolved payment.
 */
export async function markPaymentReviewRequired(id: string): Promise<void> {
  await sql`UPDATE payments SET review_required = true WHERE id = ${id}`;
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
  numberSeed: number | null;
  ticketNumbers: number[];
  phoneNumber: string;
}

/** Payment status plus the receipt data shown after confirmation. */
export async function findPaymentReceiptById(id: string): Promise<DbPaymentReceipt | null> {
  const rows = await sql<DbPaymentReceipt[]>`
    SELECT
      p.*,
      r.title AS raffle_title,
      r.public_code AS raffle_code,
      r.number_seed AS number_seed,
      u.phone_number AS phone_number,
      COALESCE(
        array_agg(t.ticket_number ORDER BY t.ticket_number)
          FILTER (WHERE t.ticket_number IS NOT NULL),
        ARRAY[]::int[]
      ) AS ticket_numbers
    FROM payments p
    JOIN raffles r ON r.id = p.raffle_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN tickets t ON t.payment_id = p.id
    WHERE p.id = ${id}
    GROUP BY p.id, r.id, u.id
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Cancels a payment the user backed out of before completing checkout —
 * atomically conditioned on it still being 'pending' so this can never
 * clobber a payment a webhook/verify call completed in the same instant
 * (e.g. the user closed the checkout screen right as Chapa confirmed it).
 */
export async function cancelPendingPayment(id: string): Promise<DbPayment | null> {
  // Explicit cancellation releases even a started checkout. The raffle lock
  // serializes this with issuance: completed tickets can never be released.
  // A subsequently verified charge follows the existing refund-review path.
  return transitionPendingPayment(id, 'failed');
}

async function transitionPendingPayment(id: string, status: PaymentStatus, onlyUnstarted = false): Promise<DbPayment | null> {
  return sql.begin(async (tx) => {
    const [snapshot] = await tx<DbPayment[]>`SELECT * FROM payments WHERE id = ${id}`;
    if (!snapshot) return null;
    await tx`SELECT id FROM raffles WHERE id = ${snapshot.raffleId} FOR UPDATE`;
    const [payment] = await tx<DbPayment[]>`UPDATE payments SET status = ${status} WHERE id = ${id}
      AND status = 'pending' AND NOT review_required AND (${!onlyUnstarted} OR checkout_started_at IS NULL) RETURNING *`;
    if (payment && (status === 'failed' || status === 'refunded')) {
      await tx`DELETE FROM ticket_number_claims WHERE payment_id = ${id} AND NOT sold`;
    }
    return payment ?? null;
  });
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<DbPayment | null> {
  return transitionPendingPayment(id, status);
}

export async function expireUnstartedPayments(): Promise<void> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM payments WHERE status = 'pending'
    AND NOT review_required AND checkout_started_at IS NULL AND reservation_expires_at <= NOW() LIMIT 100`;
  // Recheck unstarted under lock: checkout may start after the sweep's SELECT.
  for (const row of rows) await transitionPendingPayment(row.id, 'failed', true);
}

export interface DbPaymentWithDetails {
  id: string;
  raffleId: string;
  raffleTitle: string;
  raffleCode: string;
  numberSeed: number | null;
  amount: number;
  ticketCount: number;
  /** The actual ticket numbers issued for this payment — empty until the webhook lands. */
  ticketNumbers: number[];
  status: PaymentStatus;
  gateway: PaymentGateway;
  createdAt: Date;
  reviewRequired: boolean;
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
      r.number_seed AS number_seed,
      p.amount,
      p.ticket_count,
      p.status,
      p.review_required,
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
    GROUP BY p.id, r.id
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
