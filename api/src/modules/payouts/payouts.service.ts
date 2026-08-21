import {
  findPayoutById,
  findPayoutsByUserId,
  submitClaim as dbSubmitClaim,
  updatePayoutStatus as dbUpdatePayoutStatus,
  listPayouts as dbListPayouts,
} from '../../db/queries/payouts.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { SubmitClaimInput, UpdatePayoutStatusInput } from './payouts.schema.js';

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

  if (payout.status !== 'pending_claim') {
    throw new AppError(400, `Claim already submitted (status: ${payout.status})`);
  }

  if (payout.claimDeadline < new Date()) {
    throw new AppError(400, 'Claim deadline has passed');
  }

  const updated = await dbSubmitClaim(payoutId, {
    idDocumentUrl,
    deliveryAddress: data.deliveryAddress,
    deliveryPhone: data.deliveryPhone,
  });

  return updated;
}

/**
 * List the authenticated user's own win/claim history.
 */
export async function listMyPayouts(userId: string, limit: number, offset: number) {
  return findPayoutsByUserId(userId, limit, offset);
}

/**
 * Update payout status (admin action).
 */
export async function updatePayoutStatus(
  payoutId: string,
  adminId: string,
  data: UpdatePayoutStatusInput
) {
  const payout = await findPayoutById(payoutId);
  if (!payout) {
    throw new AppError(404, 'Payout not found');
  }

  const updated = await dbUpdatePayoutStatus(payoutId, data.status, adminId, data.notes);
  return updated;
}

/**
 * List payouts with optional status filter.
 */
export async function listPayouts(options: {
  status?: string;
  limit: number;
  offset: number;
}) {
  return dbListPayouts({
    status: options.status as 'pending_claim' | 'claimed' | 'verified' | 'fulfilled' | 'expired' | 'rejected' | undefined,
    limit: options.limit,
    offset: options.offset,
  });
}
