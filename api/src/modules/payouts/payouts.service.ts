import {
  findPayoutById,
  findPayoutsByUserId,
  submitClaim as dbSubmitClaim,
  updatePayoutStatus as dbUpdatePayoutStatus,
  listPayouts as dbListPayouts,
  type DbPayout,
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
 * admin acted or free-text notes — log that to `audit_log` if/when the
 * admin-app's audit log screen gets a backing route.
 */
export async function updatePayoutStatus(payoutId: string, data: UpdatePayoutStatusInput) {
  const payout = await findPayoutById(payoutId);
  if (!payout) {
    throw new AppError(404, 'Payout not found');
  }

  const updated = await dbUpdatePayoutStatus(payoutId, data.status);
  return updated ? toApiPayout(updated) : null;
}

/**
 * List payouts with optional status filter.
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
  return payouts.map(toApiPayout);
}

/**
 * List the authenticated user's own win/claim history.
 */
export async function listMyPayouts(userId: string, limit: number, offset: number) {
  const payouts = await findPayoutsByUserId(userId, limit, offset);
  return payouts.map(toApiPayout);
}
