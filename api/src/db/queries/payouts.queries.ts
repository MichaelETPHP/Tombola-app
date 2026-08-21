import { sql } from '../client.js';

export type PayoutStatus = 'pending_claim' | 'claimed' | 'verified' | 'fulfilled' | 'expired' | 'rejected';

export interface DbPayout {
  id: string;
  drawId: string;
  raffleId: string;
  winnerUserId: string;
  status: PayoutStatus;
  claimDeadline: Date;
  idDocumentUrl: string | null;
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  adminNotes: string | null;
  verifiedBy: string | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a payout record after a draw completes.
 */
export async function createPayout(data: {
  drawId: string;
  raffleId: string;
  winnerUserId: string;
  claimDeadline: Date;
}): Promise<DbPayout> {
  const rows = await sql<DbPayout[]>`
    INSERT INTO payouts (
      draw_id, raffle_id, winner_user_id,
      status, claim_deadline
    ) VALUES (
      ${data.drawId}, ${data.raffleId},
      ${data.winnerUserId}, 'pending_claim', ${data.claimDeadline}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find a payout by ID.
 */
export async function findPayoutById(id: string): Promise<DbPayout | null> {
  const rows = await sql<DbPayout[]>`
    SELECT * FROM payouts WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Find a payout by draw ID.
 */
export async function findPayoutByDrawId(drawId: string): Promise<DbPayout | null> {
  const rows = await sql<DbPayout[]>`
    SELECT * FROM payouts WHERE draw_id = ${drawId} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Submit a claim (winner uploads ID doc and delivery info).
 */
export async function submitClaim(
  id: string,
  data: {
    idDocumentUrl: string;
    deliveryAddress: string;
    deliveryPhone: string;
  }
): Promise<DbPayout | null> {
  const rows = await sql<DbPayout[]>`
    UPDATE payouts
    SET
      status = 'claimed',
      id_document_url = ${data.idDocumentUrl},
      delivery_address = ${data.deliveryAddress},
      delivery_phone = ${data.deliveryPhone},
      updated_at = NOW()
    WHERE id = ${id} AND status = 'pending_claim'
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Update payout status (admin actions: verify, fulfill, reject).
 */
export async function updatePayoutStatus(
  id: string,
  status: PayoutStatus,
  adminId: string,
  notes?: string
): Promise<DbPayout | null> {
  const fulfilledAt = status === 'fulfilled' ? new Date() : null;

  const rows = await sql<DbPayout[]>`
    UPDATE payouts
    SET
      status = ${status},
      verified_by = ${adminId},
      admin_notes = COALESCE(${notes ?? null}, admin_notes),
      fulfilled_at = COALESCE(${fulfilledAt}, fulfilled_at),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * List payouts with optional status filter.
 */
export async function listPayouts(options: {
  status?: PayoutStatus;
  limit: number;
  offset: number;
}): Promise<DbPayout[]> {
  const { status, limit, offset } = options;

  if (status) {
    return sql<DbPayout[]>`
      SELECT * FROM payouts
      WHERE status = ${status}
      ORDER BY claim_deadline ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return sql<DbPayout[]>`
    SELECT * FROM payouts
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Find all payouts won by a given user (their win/claim history).
 */
export async function findPayoutsByUserId(
  userId: string,
  limit: number,
  offset: number
): Promise<DbPayout[]> {
  return sql<DbPayout[]>`
    SELECT * FROM payouts
    WHERE winner_user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Find payouts approaching or past their claim deadline.
 */
export async function findExpiringPayouts(): Promise<DbPayout[]> {
  return sql<DbPayout[]>`
    SELECT * FROM payouts
    WHERE status = 'pending_claim'
      AND claim_deadline < NOW() + INTERVAL '24 hours'
    ORDER BY claim_deadline ASC
  `;
}
