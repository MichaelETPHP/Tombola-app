import { sql } from '../../db/client.js';
import {
  findPayoutById,
  findPayoutByIdDetailed,
  findPayoutsByUserIdDetailed,
  submitClaim as dbSubmitClaim,
  setPayoutIdDocument,
  listPayouts as dbListPayouts,
  type DbPayout,
  type DbPayoutDetailed,
  type PayoutClaimStatus,
} from '../../db/queries/payouts.queries.js';
import {
  findDeliveryMethodById,
  listActiveDeliveryMethods,
  listAllDeliveryMethods,
  createDeliveryMethod,
  updateDeliveryMethod,
} from '../../db/queries/payout-delivery-methods.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { canTransitionPayout } from '../../lib/payout-transitions.js';
import { processIdDocument } from '../../lib/image.js';
import { saveUploadedImage, deleteUploadedImage, uploadedImagePathFromPublicUrl, resolveUploadPath } from '../../lib/uploads.js';
import type {
  SubmitClaimInput,
  UpdatePayoutStatusInput,
  CreateDeliveryMethodInput,
  UpdateDeliveryMethodInput,
} from './payouts.schema.js';

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
 * Submit a prize claim (delivery info). The ID document is a separate,
 * earlier step (uploadClaimIdDocument) — it must already be on file by
 * the time this runs, precisely so an interrupted claim never loses the
 * one part (a photo) that's actually annoying to redo.
 */
export async function submitClaim(payoutId: string, userId: string, data: SubmitClaimInput) {
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

  if (!payout.idDocumentUrl) {
    throw new AppError(400, 'Upload a photo of your ID before submitting.');
  }

  const method = await findDeliveryMethodById(data.deliveryMethodId);
  if (!method || !method.isActive) {
    throw new AppError(400, 'Choose a valid delivery method.');
  }
  if (method.requiresDetails && !data.deliveryAddress?.trim()) {
    throw new AppError(400, method.detailsLabel ? `${method.detailsLabel} is required for this method.` : 'More details are required for this method.');
  }

  const updated = await dbSubmitClaim(payoutId, {
    deliveryMethod: method.label,
    deliveryAddress: data.deliveryAddress?.trim() || null,
  });

  return updated ? toApiPayout(updated) : null;
}

/**
 * Update payout status (admin action). There's no column to record which
 * admin acted or free-text notes, so that goes to audit_log instead — now
 * that the admin-app's audit log screen has a backing route to read it.
 */
export async function updatePayoutStatus(payoutId: string, adminId: string, data: UpdatePayoutStatusInput) {
  await sql.begin(async (tx) => {
    const [payout] = await tx<DbPayout[]>`SELECT * FROM payouts WHERE id = ${payoutId} FOR UPDATE`;
    if (!payout) throw new AppError(404, 'Payout not found');
    if (!canTransitionPayout(payout.claimStatus, data.status)) {
      throw new AppError(409, 'This payout changed or cannot move to that status. Refresh the review first.');
    }
    await tx`UPDATE payouts SET claim_status = ${data.status},
      id_verified_at = CASE WHEN ${data.status} = 'verified' THEN NOW() ELSE id_verified_at END,
      fulfilled_at = CASE WHEN ${data.status} = 'fulfilled' THEN NOW() ELSE fulfilled_at END,
      fulfillment_status = CASE WHEN ${data.status} = 'fulfilled' THEN 'delivered'::fulfillment_status
        WHEN ${data.status} = 'rejected' THEN 'failed'::fulfillment_status ELSE fulfillment_status END,
      updated_at = NOW() WHERE id = ${payoutId}`;
    await tx`INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES ('admin', ${adminId}, 'payout.status_changed', 'payout', ${payoutId},
        ${tx.json({ from: payout.claimStatus, to: data.status })})`;
  });
  return getPayoutById(payoutId);
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
  const payouts = await findPayoutsByUserIdDetailed(userId, limit, offset);
  return payouts.map(toApiPayoutDetailed);
}

/**
 * Get one of the authenticated user's own payouts, with raffle/prize
 * context — the claim screen's fetch. 404s (not 403) for someone else's
 * payout id, same information-hiding reasoning as everywhere else this
 * app scopes a lookup to the requester.
 */
export async function getMyPayoutById(payoutId: string, userId: string) {
  const payout = await findPayoutByIdDetailed(payoutId);
  if (!payout || payout.winnerUserId !== userId) {
    throw new AppError(404, 'Payout not found');
  }
  return toApiPayoutDetailed(payout);
}

/** Active methods — what a winner picks from on the claim screen. */
export async function getActiveDeliveryMethods() {
  return listActiveDeliveryMethods();
}

/** Every method, active or not — the admin management table. */
export async function getAllDeliveryMethods() {
  return listAllDeliveryMethods();
}

export async function addDeliveryMethod(data: CreateDeliveryMethodInput) {
  return createDeliveryMethod({
    label: data.label,
    requiresDetails: data.requiresDetails,
    detailsLabel: data.detailsLabel ?? null,
    sortOrder: data.sortOrder,
  });
}

export async function editDeliveryMethod(id: string, data: UpdateDeliveryMethodInput) {
  const updated = await updateDeliveryMethod(id, data);
  if (!updated) throw new AppError(404, 'Delivery method not found');
  return updated;
}

/**
 * Store a winner's ID-document photo for an in-progress claim. Unlike a
 * raffle prize photo, this is sensitive personal data — it deliberately
 * does NOT go through the public /uploads/:category/:filename route (see
 * uploads.routes.ts, which refuses the 'id-documents' category outright);
 * only readIdDocumentFile below, behind an ownership/admin check, can ever
 * read one back.
 */
export async function uploadClaimIdDocument(payoutId: string, userId: string, fileBuffer: Buffer): Promise<string> {
  const payout = await findPayoutById(payoutId);
  if (!payout) throw new AppError(404, 'Payout not found');
  if (payout.winnerUserId !== userId) throw new AppError(403, 'You are not authorized to claim this prize');
  if (payout.claimStatus !== 'pending_claim') throw new AppError(400, `Claim already submitted (status: ${payout.claimStatus})`);

  let processed;
  try {
    processed = await processIdDocument(fileBuffer);
  } catch {
    throw new AppError(400, 'The uploaded file is not a valid image.');
  }

  let stored;
  try {
    stored = await saveUploadedImage(processed, 'id-documents');
  } catch {
    throw new AppError(503, 'ID document storage is unavailable or not configured');
  }

  const updated = await setPayoutIdDocument(payoutId, stored.publicUrl);
  if (!updated) {
    // Lost a race with the claim resolving some other way between the
    // fetch above and now — don't leave an orphaned file on disk.
    await deleteUploadedImage(stored.path).catch(() => undefined);
    throw new AppError(400, `Claim already submitted (status: ${payout.claimStatus})`);
  }

  // A retake replaces the previous photo — clean up the one it superseded.
  const previousPath = uploadedImagePathFromPublicUrl(payout.idDocumentUrl);
  if (previousPath) deleteUploadedImage(previousPath).catch(() => undefined);

  return stored.publicUrl;
}

/**
 * Resolve a payout's stored ID-document URL to a real file on disk, for an
 * authenticated route to stream back. Returns null if there's nothing on
 * file yet or the URL doesn't point at this app's own upload storage.
 */
export function resolveIdDocumentPath(idDocumentUrl: string | null): string | null {
  const relative = uploadedImagePathFromPublicUrl(idDocumentUrl);
  if (!relative) return null;
  const [category, filename] = relative.split('/');
  return resolveUploadPath(category, filename);
}
