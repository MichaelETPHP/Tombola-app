import { sql } from '../client.js';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentGateway = 'chapa' | 'telebirr';

export interface DbPayment {
  id: string;
  userId: string;
  raffleId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gateway: PaymentGateway;
  gatewayTxRef: string;
  gatewayResponse: Record<string, unknown> | null;
  ticketCount: number;
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
  currency: string;
  gateway: PaymentGateway;
  gatewayTxRef: string;
  ticketCount: number;
}): Promise<DbPayment> {
  const rows = await sql<DbPayment[]>`
    INSERT INTO payments (
      user_id, raffle_id, amount, currency, status,
      gateway, gateway_tx_ref, ticket_count
    ) VALUES (
      ${data.userId}, ${data.raffleId}, ${data.amount}, ${data.currency},
      'pending', ${data.gateway}, ${data.gatewayTxRef}, ${data.ticketCount}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find a payment by gateway transaction reference.
 * Used for idempotent webhook processing.
 */
export async function findPaymentByTxRef(gatewayTxRef: string): Promise<DbPayment | null> {
  const rows = await sql<DbPayment[]>`
    SELECT * FROM payments
    WHERE gateway_tx_ref = ${gatewayTxRef}
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

/**
 * Update payment status and store gateway response.
 */
export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  gatewayResponse?: Record<string, unknown>
): Promise<DbPayment | null> {
  const rows = await sql<DbPayment[]>`
    UPDATE payments
    SET
      status = ${status},
      gateway_response = ${gatewayResponse ? JSON.stringify(gatewayResponse) : null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * List payments for a user.
 */
export async function listUserPayments(
  userId: string,
  limit: number,
  offset: number
): Promise<DbPayment[]> {
  return sql<DbPayment[]>`
    SELECT * FROM payments
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
