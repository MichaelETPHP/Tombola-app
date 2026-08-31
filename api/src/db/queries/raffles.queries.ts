import { sql } from '../client.js';

export type RaffleStatus =
  | 'draft'
  | 'open'
  | 'locked'
  | 'awaiting_trigger'
  | 'drawing'
  | 'completed'
  | 'cancelled';

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
  extensionDays: number;
  opensAt: Date;
  deadlineAt: Date;
  status: RaffleStatus;
  /** Invite link for a Telegram group created manually, offline, for this raffle. Optional. */
  telegramGroupLink: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /** Computed via a subquery on every SELECT below — not a real column (the schema has no counter to increment). */
  ticketsSold: number;
}

/** Appended to every raffles SELECT/RETURNING to compute the live ticket count. */
const TICKETS_SOLD_EXPR = sql`(SELECT COUNT(*)::int FROM tickets t WHERE t.raffle_id = raffles.id) AS tickets_sold`;

/**
 * Create a new raffle. Opens immediately; the provably-fair seed is
 * generated later, at draw execution time (see draws.service.ts) — the
 * schema has no column to pre-commit a hash before then.
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
  createdBy: string;
  opensAt?: Date;
  deadlineAt?: Date;
  status?: 'draft' | 'open';
  telegramGroupLink?: string;
}): Promise<DbRaffle> {
  const opensAt = data.opensAt ?? new Date();
  const deadline = data.deadlineAt ?? new Date(opensAt);
  if (!data.deadlineAt) deadline.setDate(deadline.getDate() + data.deadlineDays);

  const rows = await sql<DbRaffle[]>`
    INSERT INTO raffles (
      title, description, prize_name, prize_value, prize_image_url,
      ticket_price, ticket_cap, max_tickets_per_user, deadline_days,
      status, opens_at, deadline_at, created_by, telegram_group_link
    ) VALUES (
      ${data.title}, ${data.description ?? null}, ${data.prizeName},
      ${data.prizeValue}, ${data.prizeImageUrl ?? null},
      ${data.ticketPrice}, ${data.ticketCap}, ${data.maxTicketsPerUser},
      ${data.deadlineDays}, ${data.status ?? 'draft'}, ${opensAt}, ${deadline}, ${data.createdBy},
      ${data.telegramGroupLink ?? null}
    )
    RETURNING *, 0 AS tickets_sold
  `;
  return rows[0];
}

export async function updateRaffle(
  id: string,
  updates: Partial<Pick<DbRaffle, 'title' | 'description' | 'prizeName' | 'prizeValue' | 'prizeImageUrl' | 'ticketPrice' | 'ticketCap' | 'maxTicketsPerUser' | 'opensAt' | 'telegramGroupLink'>>
): Promise<DbRaffle | null> {
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) return findRaffleById(id);
  const rows = await sql<DbRaffle[]>`
    UPDATE raffles
    SET ${sql(updates, ...keys)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *, ${TICKETS_SOLD_EXPR}
  `;
  return rows[0] ?? null;
}

/**
 * Find a raffle by ID.
 */
export async function findRaffleById(id: string): Promise<DbRaffle | null> {
  const rows = await sql<DbRaffle[]>`
    SELECT raffles.*, ${TICKETS_SOLD_EXPR}
    FROM raffles
    WHERE id = ${id}
    LIMIT 1
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
      SELECT raffles.*, ${TICKETS_SOLD_EXPR}
      FROM raffles
      WHERE status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return sql<DbRaffle[]>`
    SELECT raffles.*, ${TICKETS_SOLD_EXPR}
    FROM raffles
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
    RETURNING *, ${TICKETS_SOLD_EXPR}
  `;
  return rows[0] ?? null;
}

/**
 * Extend a raffle's deadline — updates `deadline_at` in place and logs the
 * extension to `raffle_extensions` (there's no counter/original-deadline
 * column on `raffles` itself; the log table is the source of truth for history).
 */
export async function extendRaffleDeadline(
  id: string,
  newDeadline: Date,
  reason?: string
): Promise<DbRaffle | null> {
  return sql.begin(async (tx) => {
    const [raffle] = await tx<DbRaffle[]>`
      SELECT raffles.*, ${TICKETS_SOLD_EXPR}
      FROM raffles
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!raffle) return null;

    await tx`
      INSERT INTO raffle_extensions (
        raffle_id, previous_deadline, new_deadline, tickets_sold_at_extension, reason
      ) VALUES (
        ${id}, ${raffle.deadlineAt}, ${newDeadline}, ${raffle.ticketsSold},
        ${reason ?? 'cap not reached by deadline'}
      )
    `;

    const [updated] = await tx<DbRaffle[]>`
      UPDATE raffles
      SET deadline_at = ${newDeadline}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *, ${TICKETS_SOLD_EXPR}
    `;
    return updated ?? null;
  });
}

/**
 * Find open raffles that have hit their ticket cap (ready to lock).
 */
export async function findRafflesAtCap(): Promise<DbRaffle[]> {
  return sql<DbRaffle[]>`
    SELECT raffles.*, ${TICKETS_SOLD_EXPR}
    FROM raffles
    WHERE status = 'open'
      AND (SELECT COUNT(*) FROM tickets t WHERE t.raffle_id = raffles.id) >= ticket_cap
  `;
}

/**
 * Find open raffles past their deadline (need extension or action).
 */
export async function findRafflesPastDeadline(): Promise<DbRaffle[]> {
  return sql<DbRaffle[]>`
    SELECT raffles.*, ${TICKETS_SOLD_EXPR}
    FROM raffles
    WHERE status = 'open'
      AND deadline_at < NOW()
  `;
}
