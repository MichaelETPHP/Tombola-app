import type postgres from 'postgres';
import { sql } from '../client.js';

export interface DbTicket {
  id: string;
  raffleId: string;
  ticketNumber: number;
  userId: string;
  paymentId: string;
  purchasedAt: Date;
  ticketCode?: string;
}

/**
 * Create tickets for a user in a raffle.
 * Returns the created ticket records.
 */
export async function createTickets(data: {
  raffleId: string;
  userId: string;
  count: number;
  paymentId: string;
  startingNumber: number;
}): Promise<DbTicket[]> {
  const values: { raffleId: string; userId: string; ticketNumber: number; paymentId: string }[] =
    Array.from({ length: data.count }, (_, i) => ({
      raffleId: data.raffleId,
      userId: data.userId,
      ticketNumber: data.startingNumber + i,
      paymentId: data.paymentId,
    }));

  // Build batch insert using postgres.js. The `sql(rows, ...columns)` helper's
  // generic types don't narrow correctly when embedded inside another tagged
  // template (a known postgres.js typings limitation, not a logic issue) —
  // cast narrowly here rather than losing type safety on `values` itself.
  const insertHelper = sql(values, 'raffleId', 'userId', 'ticketNumber', 'paymentId') as unknown as postgres.Parameter;

  return sql<DbTicket[]>`
    INSERT INTO tickets ${insertHelper}
    RETURNING *
  `;
}

/**
 * Count how many tickets a user holds in a specific raffle.
 */
export async function countUserTicketsInRaffle(
  raffleId: string,
  userId: string
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text as count
    FROM tickets
    WHERE raffle_id = ${raffleId} AND user_id = ${userId}
  `;
  return parseInt(rows[0].count, 10);
}

/**
 * List all tickets for a user across all raffles.
 */
export async function listUserTickets(userId: string): Promise<DbTicket[]> {
  return sql<DbTicket[]>`
    SELECT t.*, r.public_code || '-' || lpad(t.ticket_number::text, 5, '0') AS ticket_code
    FROM tickets t
    JOIN raffles r ON t.raffle_id = r.id
    WHERE t.user_id = ${userId}
    ORDER BY t.purchased_at DESC
  `;
}

/**
 * List all tickets in a raffle (for draw).
 */
export async function listRaffleTickets(raffleId: string): Promise<DbTicket[]> {
  return sql<DbTicket[]>`
    SELECT * FROM tickets
    WHERE raffle_id = ${raffleId}
    ORDER BY ticket_number ASC
  `;
}

/**
 * Find a specific ticket by raffle + ticket number (used during draw).
 */
export async function findTicketByNumber(
  raffleId: string,
  ticketNumber: number
): Promise<DbTicket | null> {
  const rows = await sql<DbTicket[]>`
    SELECT * FROM tickets
    WHERE raffle_id = ${raffleId} AND ticket_number = ${ticketNumber}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Get the next available ticket number for a raffle.
 */
export async function getNextTicketNumber(raffleId: string): Promise<number> {
  const rows = await sql<{ maxNum: string | null }[]>`
    SELECT MAX(ticket_number)::text as max_num
    FROM tickets
    WHERE raffle_id = ${raffleId}
  `;
  const maxNum = rows[0]?.maxNum;
  return maxNum ? parseInt(maxNum, 10) + 1 : 1;
}
