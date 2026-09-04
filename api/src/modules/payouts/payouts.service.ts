import { sql } from '../../db/client.js';
import {
  findPayoutById,
  findPayoutByIdDetailed,
  findPayoutsByUserId,
  submitClaim as dbSubmitClaim,
  updatePayoutStatus as dbUpdatePayoutStatus,
  listPayouts as dbListPayouts,
  type DbPayout,
  type DbPayoutDetailed,
  type PayoutClaimStatus,
} from '../../db/queries/payouts.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { SubmitClaimInput, UpdatePayoutStatusInput } from './payouts.schema.js';

/**
 * Shape the API exposes for a payout — keeps `status` stable for clients
 * (mirroring `claim_status`) and drops the columns that don't exist
 * (delivery_phone, admin notes, verified_by) in favor of what does.
 */
function toApiPayout(payout: DbPayout) {
  return {
    id: payout.id,
    raffleId: payout.raffleId,
    drawResultId: payout.drawResultId,
    winnerUserId: payout.winnerUserId,
    status: payout.claimStatus,
    grossPrizeValue: payout.grossPrizeValue,
    taxWithheld: payout.taxWithheld,
    netValue: payout.netValue,
    idDocumentUrl: payout.idDocumentUrl,
    deliveryMethod: payout.deliveryMethod,
    deliveryAddress: payout.deliveryAddress,
    fulfillmentStatus: payout.fulfillmentStatus,
    claimDeadline: payout.claimDeadline,
    claimedAt: payout.claimedAt,
    fulfilledAt: payout.fulfilledAt,
    createdAt: payout.createdAt,
  };
}

/** toApiPayout, plus the raffle/winner/prize context the admin dashboard
 * shows instead of raw UUIDs. */
function toApiPayoutDetailed(payout: DbPayoutDetailed) {
  return {
    ...toApiPayout(payout),
    raffleTitle: payout.raffleTitle,
    raffleCode: payout.raffleCode,
    winnerFullName: payout.winnerFullName,
    winnerPhone: payout.winnerPhone,
    prizeName: payout.prizeName,
    prizeTier: payout.prizeTier,
  };
}

/**
 * Submit a prize claim (winner provides delivery info + ID document).
 */
export async function submitClaim(
  payoutId: string,
  userId: string,
  data: SubmitClaimInput,
  idDocumentUrl: string
) {
  const payout = await findPayoutById(payoutId);
  if (!payout) {
    throw new AppError(404, 'Payout not found');
  }

  if (payout.winnerUserId !== userId) {
    throw new AppError(403, 'You are not authorized to claim this prize');
  }

  if (payout.claimStatus !== 'pending_claim') {
    throw new AppError(400, `Claim already submitted (status: ${payout.claimStatus})`);
  }

  if (payout.claimDeadline < new Date()) {
    throw new AppError(400, 'Claim deadline has passed');
  }

  const updated = await dbSubmitClaim(payoutId, {
    idDocumentUrl,
    deliveryMethod: data.deliveryMethod,
    deliveryAddress: data.deliveryAddress,
  });

  return updated ? toApiPayout(updated) : null;
}

/**
 * Update payout status (admin action). There's no column to record which
 * admin acted or free-text notes, so that goes to audit_log instead — now
 * that the admin-app's audit log screen has a backing route to read it.
 */
export async function updatePayoutStatus(payoutId: string, adminId: string, data: UpdatePayoutStatusInput) {
  const payout = await findPayoutById(payoutId);
  if (!payout) {
    throw new AppError(404, 'Payout not found');
  }

  const updated = await dbUpdatePayoutStatus(payoutId, data.status);
  await sql`
    INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES ('admin', ${adminId}, 'payout.status_changed', 'payout', ${payoutId},
      ${sql.json({ from: payout.claimStatus, to: data.status })})
  `;
  return updated ? toApiPayout(updated) : null;
}

/**
 * Get a single payout with raffle/winner/prize context (admin review page).
 */
export async function getPayoutById(payoutId: string) {
  const payout = await findPayoutByIdDetailed(payoutId);
  if (!payout) {
    throw new AppError(404, 'Payout not found');
  }
  return toApiPayoutDetailed(payout);
}

/**
 * List payouts with optional status filter, raffle/winner/prize context
 * included for the admin dashboard.
 */
export async function listPayouts(options: {
  status?: string;
  limit: number;
  offset: number;
}) {
  const payouts = await dbListPayouts({
    status: options.status as PayoutClaimStatus | undefined,
    limit: options.limit,
    offset: options.offset,
  });
  return payouts.map(toApiPayoutDetailed);
}

/**
 * List the authenticated user's own win/claim history.
 */
export async function listMyPayouts(userId: string, limit: number, offset: number) {
  const payouts = await findPayoutsByUserId(userId, limit, offset);
  return payouts.map(toApiPayout);
}
