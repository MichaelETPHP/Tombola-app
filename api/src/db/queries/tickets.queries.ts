import type postgres from 'postgres';
import { sql } from '../client.js';
import { ticketDisplayNumber } from '../../lib/ticket-display-number.js';

export interface DbTicket {
  id: string;
  raffleId: string;
  ticketNumber: number;
  userId: string;
  paymentId: string;
  purchasedAt: Date;
  ticketCode?: string;
  raffleTitle?: string;
  raffleStatus?: string;
  raffleDeadlineAt?: Date;
  ticketPrice?: number;
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
  const rows = await sql<(DbTicket & { publicCode: string; numberSeed: number | null })[]>`
    SELECT t.*, r.public_code, r.number_seed,
           r.title AS raffle_title, r.status AS raffle_status, r.deadline_at AS raffle_deadline_at, r.ticket_price
    FROM tickets t
    JOIN raffles r ON t.raffle_id = r.id
    WHERE t.user_id = ${userId}
    ORDER BY t.purchased_at DESC
  `;
  // Built in JS rather than SQL's lpad() so this shares the exact same
  // scramble as everywhere else a ticket number is shown (see
  // ticket-display-number.ts) — a raffle with no number_seed falls back to
  // the original plain zero-padded number, unchanged.
  return rows.map((row) => ({ ...row, ticketCode: `${row.publicCode}-${ticketDisplayNumber(row.numberSeed, row.ticketNumber)}` }));
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
