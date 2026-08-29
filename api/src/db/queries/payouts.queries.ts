import { sql } from '../client.js';

export type PayoutClaimStatus =
  | 'pending_claim'
  | 'id_submitted'
  | 'verified'
  | 'rejected'
  | 'fulfilled'
  | 'expired';

export type DeliveryMethod = 'pickup' | 'delivery';
export type FulfillmentStatus = 'processing' | 'shipped' | 'delivered' | 'failed';

export interface DbPayout {
  id: string;
  raffleId: string;
  drawResultId: string;
  winnerUserId: string;
  grossPrizeValue: number;
  taxRate: number;
  taxWithheld: number;
  netValue: number;
  claimStatus: PayoutClaimStatus;
  idDocumentUrl: string | null;
  idVerifiedAt: Date | null;
  deliveryMethod: DeliveryMethod | null;
  deliveryAddress: string | null;
  fulfillmentStatus: FulfillmentStatus;
  claimDeadline: Date;
  claimedAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Matches the `tax_rate` column default in the schema. */
const DEFAULT_TAX_RATE = 15;

/**
 * Create a payout record after a draw completes. Withholding is computed
 * from the raffle's prize value at the schema's default tax rate.
 */
export async function createPayout(data: {
  raffleId: string;
  drawResultId: string;
  winnerUserId: string;
  grossPrizeValue: number;
  claimDeadline: Date;
}): Promise<DbPayout> {
  const taxWithheld = Math.round(data.grossPrizeValue * (DEFAULT_TAX_RATE / 100) * 100) / 100;
  const netValue = Math.round((data.grossPrizeValue - taxWithheld) * 100) / 100;

  const rows = await sql<DbPayout[]>`
    INSERT INTO payouts (
      raffle_id, draw_result_id, winner_user_id,
      gross_prize_value, tax_rate, tax_withheld, net_value,
      claim_status, claim_deadline
    ) VALUES (
      ${data.raffleId}, ${data.drawResultId}, ${data.winnerUserId},
      ${data.grossPrizeValue}, ${DEFAULT_TAX_RATE}, ${taxWithheld}, ${netValue},
      'pending_claim', ${data.claimDeadline}
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
 * Submit a claim (winner uploads ID doc and delivery info).
 */
export async function submitClaim(
  id: string,
  data: {
    idDocumentUrl: string;
    deliveryMethod: DeliveryMethod;
    deliveryAddress: string;
  }
): Promise<DbPayout | null> {
  const rows = await sql<DbPayout[]>`
    UPDATE payouts
    SET
      claim_status = 'id_submitted',
      id_document_url = ${data.idDocumentUrl},
      delivery_method = ${data.deliveryMethod},
      delivery_address = ${data.deliveryAddress},
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id} AND claim_status = 'pending_claim'
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Update payout claim status (admin actions: verify, fulfill, reject).
 * There's no column to record which admin acted or free-text notes — log
 * that to `audit_log` if/when that's wired up.
 */
export async function updatePayoutStatus(
  id: string,
  claimStatus: PayoutClaimStatus
): Promise<DbPayout | null> {
  const idVerifiedAt = claimStatus === 'verified' ? new Date() : null;
  const fulfilledAt = claimStatus === 'fulfilled' ? new Date() : null;
  const fulfillmentStatus: FulfillmentStatus | null =
    claimStatus === 'fulfilled' ? 'delivered' : claimStatus === 'rejected' ? 'failed' : null;

  const rows = await sql<DbPayout[]>`
    UPDATE payouts
    SET
      claim_status = ${claimStatus},
      id_verified_at = COALESCE(${idVerifiedAt}, id_verified_at),
      fulfilled_at = COALESCE(${fulfilledAt}, fulfilled_at),
      fulfillment_status = COALESCE(${fulfillmentStatus}, fulfillment_status),
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
  status?: PayoutClaimStatus;
  limit: number;
  offset: number;
}): Promise<DbPayout[]> {
  const { status, limit, offset } = options;

  if (status) {
    return sql<DbPayout[]>`
      SELECT * FROM payouts
      WHERE claim_status = ${status}
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
    WHERE claim_status = 'pending_claim'
      AND claim_deadline < NOW() + INTERVAL '24 hours'
    ORDER BY claim_deadline ASC
  `;
}
