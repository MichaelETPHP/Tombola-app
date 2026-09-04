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
  categoryCode: string;
  raffleNumber: number;
  publicCode: string;
  drawServerSeed: string | null;
  drawServerSeedHash: string | null;
  scheduledDrawAt: Date | null;
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
 * Create a new raffle. The provably-fair server seed is committed right
 * here, before the raffle even opens — see raffles.service.ts, which
 * generates it and passes it in as drawServerSeed/drawServerSeedHash.
 */
export async function createRaffle(data: {
  title: string;
  description?: string;
  prizeName: string;
  categoryCode: string;
  drawServerSeed: string;
  drawServerSeedHash: string;
  prizeValue: number;
  prizeImageUrl?: string;
  additionalPrizes?: { name: string; value: number }[];
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

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`yeneeta:${data.categoryCode}`}))`;
    const [sequence] = await tx<{ raffleNumber: number }[]>`
      SELECT COALESCE(MAX(raffle_number), 0)::int + 1 AS raffle_number
      FROM raffles WHERE category_code = ${data.categoryCode}
    `;
    if (sequence.raffleNumber > 999) throw new Error(`Raffle sequence exhausted for ${data.categoryCode}`);
    const publicCode = `${data.categoryCode}-${String(sequence.raffleNumber).padStart(3, '0')}`;
    const rows = await tx<DbRaffle[]>`
    INSERT INTO raffles (
      title, description, prize_name, prize_value, prize_image_url,
      ticket_price, ticket_cap, max_tickets_per_user, deadline_days,
      status, opens_at, deadline_at, created_by, telegram_group_link,
      category_code, raffle_number, public_code, draw_server_seed, draw_server_seed_hash
    ) VALUES (
      ${data.title}, ${data.description ?? null}, ${data.prizeName},
      ${data.prizeValue}, ${data.prizeImageUrl ?? null},
      ${data.ticketPrice}, ${data.ticketCap}, ${data.maxTicketsPerUser},
      ${data.deadlineDays}, ${data.status ?? 'draft'}, ${opensAt}, ${deadline}, ${data.createdBy},
      ${data.telegramGroupLink ?? null}, ${data.categoryCode}, ${sequence.raffleNumber}, ${publicCode},
      ${data.drawServerSeed}, ${data.drawServerSeedHash}
    )
    RETURNING *, 0 AS tickets_sold
  `;
    // Every raffle needs at least a tier-1 prize row for the draw to run —
    // name/value stay synced with prizeName/prizeValue below (the admin
    // form's "grand prize" fields ARE tier 1, one shared source of truth).
    // image_url deliberately starts NULL and is never synced from
    // raffles.prize_image_url — the raffle's main cover photo and tier 1's
    // own prize photo are two independent images, same as tiers 2 and 3.
    await tx`
      INSERT INTO raffle_prizes (raffle_id, tier, name, value)
      VALUES (${rows[0].id}, 1, ${data.prizeName}, ${data.prizeValue})
    `;
    for (const [index, prize] of (data.additionalPrizes ?? []).entries()) {
      await tx`
        INSERT INTO raffle_prizes (raffle_id, tier, name, value)
        VALUES (${rows[0].id}, ${index + 2}, ${prize.name}, ${prize.value})
      `;
    }
    return rows[0];
  });
}

export interface DbRafflePrize {
  id: string;
  tier: number;
  name: string;
  value: number;
  imageUrl: string | null;
}

export async function listRafflePrizes(raffleId: string): Promise<DbRafflePrize[]> {
  return sql<DbRafflePrize[]>`
    SELECT id, tier, name, value, image_url AS "imageUrl"
    FROM raffle_prizes WHERE raffle_id = ${raffleId} ORDER BY tier ASC
  `;
}

export async function findRafflePrize(raffleId: string, prizeId: string): Promise<DbRafflePrize | null> {
  const rows = await sql<DbRafflePrize[]>`
    SELECT id, tier, name, value, image_url AS "imageUrl"
    FROM raffle_prizes WHERE id = ${prizeId} AND raffle_id = ${raffleId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateRafflePrizeImage(prizeId: string, imageUrl: string): Promise<DbRafflePrize | null> {
  const rows = await sql<DbRafflePrize[]>`
    UPDATE raffle_prizes SET image_url = ${imageUrl} WHERE id = ${prizeId}
    RETURNING id, tier, name, value, image_url AS "imageUrl"
  `;
  return rows[0] ?? null;
}

/**
 * Reconciles the tier-2+ prize set for a raffle (tier 1 stays owned by
 * updateRaffle's prizeName/prizeValue sync below) — UPSERTS by tier number
 * rather than delete-then-recreate, so an existing tier's id and uploaded
 * image_url survive a save that only changed its name/value. Only tiers
 * beyond the new count get deleted (e.g. the admin removed the 3rd prize).
 * Passing an empty array removes every additional tier, dropping the
 * raffle back to a single prize.
 */
export async function setAdditionalRafflePrizes(
  raffleId: string,
  additionalPrizes: { name: string; value: number }[]
): Promise<void> {
  await sql.begin(async (tx) => {
    const maxTier = additionalPrizes.length + 1;
    await tx`DELETE FROM raffle_prizes WHERE raffle_id = ${raffleId} AND tier > ${maxTier}`;
    for (const [index, prize] of additionalPrizes.entries()) {
      await tx`
        INSERT INTO raffle_prizes (raffle_id, tier, name, value)
        VALUES (${raffleId}, ${index + 2}, ${prize.name}, ${prize.value})
        ON CONFLICT (raffle_id, tier) DO UPDATE
          SET name = EXCLUDED.name, value = EXCLUDED.value
      `;
    }
  });
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
  const updated = rows[0];
  // Keep the tier-1 raffle_prizes row's name/value in sync with the
  // single-prize fields the admin form still edits — but NOT image_url.
  // Tier 1's own prize photo (uploaded via setAdditionalRafflePrizes'
  // sibling, the per-tier image route) is a separate image from the
  // raffle's main cover photo, same as tiers 2 and 3 — syncing it here
  // would silently overwrite tier 1's dedicated photo every time the main
  // cover changes, which is exactly the bug this comment replaced.
  if (updated && (keys.includes('prizeName') || keys.includes('prizeValue'))) {
    await sql`
      INSERT INTO raffle_prizes (raffle_id, tier, name, value)
      VALUES (${updated.id}, 1, ${updated.prizeName}, ${updated.prizeValue})
      ON CONFLICT (raffle_id, tier) DO UPDATE
        SET name = EXCLUDED.name, value = EXCLUDED.value
    `;
  }
  return updated ?? null;
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
  reason?: string,
  adminId?: string
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
        raffle_id, previous_deadline, new_deadline, tickets_sold_at_extension, reason, extended_by
      ) VALUES (
        ${id}, ${raffle.deadlineAt}, ${newDeadline}, ${raffle.ticketsSold},
        ${reason ?? 'cap not reached by deadline'}, ${adminId ?? null}
      )
    `;

    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES ('admin', ${adminId ?? null}, 'raffle.extended', 'raffle', ${id},
        ${tx.json({ previousDeadline: raffle.deadlineAt.toISOString(), newDeadline: newDeadline.toISOString(), reason: reason ?? 'cap not reached by deadline', ticketsSold: raffle.ticketsSold })})
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

export async function lockRaffleForScheduledDraw(id: string): Promise<void> {
  await sql`
    UPDATE raffles
    SET status = 'locked', scheduled_draw_at = NOW() + INTERVAL '2 days', updated_at = NOW()
    WHERE id = ${id} AND status = 'open'
  `;
}

export async function findRafflesReadyForDraw(): Promise<DbRaffle[]> {
  return sql<DbRaffle[]>`
    SELECT raffles.*, ${TICKETS_SOLD_EXPR}
    FROM raffles
    WHERE status = 'locked' AND scheduled_draw_at <= NOW()
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

/**
 * Which of these raffle IDs have at least one payout already marked
 * 'fulfilled' (real prize value actually delivered to a winner) — used to
 * block deletion, since removing the raffle would erase the only record
 * that money/a prize actually went out.
 */
export async function findRaffleIdsWithFulfilledPayouts(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ raffleId: string }[]>`
    SELECT DISTINCT raffle_id AS "raffleId" FROM payouts
    WHERE raffle_id = ANY(${ids}::uuid[]) AND claim_status = 'fulfilled'
  `;
  return rows.map((r) => r.raffleId);
}

/**
 * Hard-delete a raffle. Every related row (tickets, payments, prizes,
 * draw triggers/results, payouts, notifications, room messages) cascades
 * via ON DELETE CASCADE — see Migration/014_raffle_delete_cascade.sql.
 */
export async function deleteRaffle(id: string): Promise<{ id: string; title: string } | null> {
  const rows = await sql<{ id: string; title: string }[]>`
    DELETE FROM raffles WHERE id = ${id} RETURNING id, title
  `;
  return rows[0] ?? null;
}

/**
 * Hard-delete multiple raffles in one statement. Returns the IDs actually
 * found and deleted.
 */
export async function bulkDeleteRaffles(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    DELETE FROM raffles WHERE id = ANY(${ids}::uuid[]) RETURNING id
  `;
  return rows.map((r) => r.id);
}
