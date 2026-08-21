import { sql } from '../client.js';

export type RaffleStatus = 'open' | 'locked' | 'drawing' | 'completed' | 'cancelled';

export interface DbRaffle {
  id: string;
  title: string;
  description: string | null;
  prizeName: string;
  prizeValue: number;
  prizeImageUrl: string | null;
  ticketPrice: number;
  ticketCap: number;
  maxTicketsPerUser: number;
  deadlineDays: number;
  status: RaffleStatus;
  ticketsSold: number;
  serverSeedHash: string;
  serverSeed: string;
  extensionCount: number;
  originalDeadline: Date;
  currentDeadline: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new raffle.
 */
export async function createRaffle(data: {
  title: string;
  description?: string;
  prizeName: string;
  prizeValue: number;
  prizeImageUrl?: string;
  ticketPrice: number;
  ticketCap: number;
  maxTicketsPerUser: number;
  deadlineDays: number;
  serverSeedHash: string;
  serverSeed: string;
  createdBy: string;
}): Promise<DbRaffle> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + data.deadlineDays);

  const rows = await sql<DbRaffle[]>`
    INSERT INTO raffles (
      title, description, prize_name, prize_value, prize_image_url,
      ticket_price, ticket_cap, max_tickets_per_user, deadline_days,
      server_seed_hash, server_seed, status, tickets_sold,
      original_deadline, current_deadline, extension_count, created_by
    ) VALUES (
      ${data.title}, ${data.description ?? null}, ${data.prizeName},
      ${data.prizeValue}, ${data.prizeImageUrl ?? null},
      ${data.ticketPrice}, ${data.ticketCap}, ${data.maxTicketsPerUser},
      ${data.deadlineDays}, ${data.serverSeedHash}, ${data.serverSeed},
      'open', 0, ${deadline}, ${deadline}, 0, ${data.createdBy}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find a raffle by ID.
 */
export async function findRaffleById(id: string): Promise<DbRaffle | null> {
  const rows = await sql<DbRaffle[]>`
    SELECT * FROM raffles WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * List raffles with optional status filter and pagination.
 */
export async function listRaffles(options: {
  status?: RaffleStatus;
  limit: number;
  offset: number;
}): Promise<DbRaffle[]> {
  const { status, limit, offset } = options;

  if (status) {
    return sql<DbRaffle[]>`
      SELECT * FROM raffles
      WHERE status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return sql<DbRaffle[]>`
    SELECT * FROM raffles
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Update raffle status.
 */
export async function updateRaffleStatus(id: string, status: RaffleStatus): Promise<DbRaffle | null> {
  const rows = await sql<DbRaffle[]>`
    UPDATE raffles
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Increment tickets sold count.
 */
export async function incrementTicketsSold(id: string, count: number): Promise<DbRaffle | null> {
  const rows = await sql<DbRaffle[]>`
    UPDATE raffles
    SET tickets_sold = tickets_sold + ${count}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Extend a raffle's deadline.
 */
export async function extendRaffleDeadline(
  id: string,
  newDeadline: Date
): Promise<DbRaffle | null> {
  const rows = await sql<DbRaffle[]>`
    UPDATE raffles
    SET
      current_deadline = ${newDeadline},
      extension_count = extension_count + 1,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Find open raffles that have hit their ticket cap (ready to lock).
 */
export async function findRafflesAtCap(): Promise<DbRaffle[]> {
  return sql<DbRaffle[]>`
    SELECT * FROM raffles
    WHERE status = 'open'
      AND tickets_sold >= ticket_cap
  `;
}

/**
 * Find open raffles past their deadline (need extension or action).
 */
export async function findRafflesPastDeadline(): Promise<DbRaffle[]> {
  return sql<DbRaffle[]>`
    SELECT * FROM raffles
    WHERE status = 'open'
      AND current_deadline < NOW()
  `;
}
