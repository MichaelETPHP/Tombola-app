import {
  createRaffle as dbCreateRaffle,
  findRaffleById,
  listRaffles as dbListRaffles,
  updateRaffle as dbUpdateRaffle,
  updateRaffleStatus as dbUpdateRaffleStatus,
  extendRaffleDeadline,
  listRafflePrizes,
  setAdditionalRafflePrizes,
  deleteRaffle as dbDeleteRaffle,
  bulkDeleteRaffles as dbBulkDeleteRaffles,
  findRaffleIdsWithFulfilledPayouts,
  type DbRaffle,
} from '../../db/queries/raffles.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { commitServerSeed, generateServerSeed } from '../../lib/provably-fair.js';
import type { CreateRaffleInput, ListRafflesInput, UpdateRaffleInput, UpdateRaffleStatusInput } from './raffles.schema.js';

/**
 * Shape the API exposes for a raffle — keeps `currentDeadline` stable for
 * clients even though the DB column is `deadline_at`.
 */
function toApiRaffle(raffle: DbRaffle) {
  return {
    id: raffle.id,
    title: raffle.title,
    description: raffle.description,
    prizeName: raffle.prizeName,
    categoryCode: raffle.categoryCode,
    raffleNumber: raffle.raffleNumber,
    publicCode: raffle.publicCode,
    drawCommitment: raffle.drawServerSeedHash,
    scheduledDrawAt: raffle.scheduledDrawAt,
    prizeValue: raffle.prizeValue,
    prizeImageUrl: raffle.prizeImageUrl,
    ticketPrice: raffle.ticketPrice,
    ticketCap: raffle.ticketCap,
    ticketsSold: raffle.ticketsSold,
    maxTicketsPerUser: raffle.maxTicketsPerUser,
    status: raffle.status,
    telegramGroupLink: raffle.telegramGroupLink,
    currentDeadline: raffle.deadlineAt,
    opensAt: raffle.opensAt,
    deadlineDays: raffle.deadlineDays,
    createdAt: raffle.createdAt,
    updatedAt: raffle.updatedAt,
  };
}

// Same floor everywhere it's computed (creation validation, update
// validation, manual-lock eligibility) — the minimum number of tickets
// that must sell to cover every prize tier's value at this ticket price.
function computeMinTicketCap(prizeValue: number, ticketPrice: number, additionalPrizes: { value: number }[]): number {
  const totalPrizeValue = prizeValue + additionalPrizes.reduce((sum, p) => sum + p.value, 0);
  return Math.ceil(totalPrizeValue / ticketPrice);
}

async function withPrizes(raffle: DbRaffle) {
  const prizes = await listRafflePrizes(raffle.id);
  const minTicketCap = computeMinTicketCap(raffle.prizeValue, raffle.ticketPrice, prizes.filter((p) => p.tier > 1));
  return { ...toApiRaffle(raffle), prizes, minTicketCap };
}

/**
 * Create a new raffle (admin only). The provably-fair server seed is
 * committed up front, before the raffle even opens for sales — see
 * provably-fair.ts for why that timing is what makes the commitment
 * independently verifiable rather than just trusted after the fact.
 */
export async function createRaffle(data: CreateRaffleInput, adminId: string) {
  if (data.deadlineAt && data.deadlineAt <= new Date()) throw new AppError(400, 'Deadline must be in the future');
  if (data.status === 'open' && data.opensAt && data.opensAt > new Date()) {
    throw new AppError(400, 'A future raffle must remain in draft status');
  }
  const drawServerSeed = generateServerSeed();
  const drawServerSeedHash = await commitServerSeed(drawServerSeed);
  const raffle = await dbCreateRaffle({ ...data, createdBy: adminId, drawServerSeed, drawServerSeedHash });
  return withPrizes(raffle);
}

export async function updateRaffle(id: string, data: UpdateRaffleInput) {
  const current = await findRaffleById(id);
  if (!current) throw new AppError(404, 'raffle.notFound');
  if (['completed', 'cancelled'].includes(current.status)) throw new AppError(409, 'raffle.invalidTransition');

  const changesTicketRules = data.ticketPrice !== undefined || data.ticketCap !== undefined || data.maxTicketsPerUser !== undefined;
  if (changesTicketRules && current.ticketsSold > 0) throw new AppError(409, 'raffle.salesLocked');
  if (data.ticketCap !== undefined && data.ticketCap < current.ticketsSold) throw new AppError(400, 'Ticket cap cannot be below tickets already sold');
  if (data.opensAt !== undefined && current.status !== 'draft') throw new AppError(409, 'Opening time can only be changed while the raffle is a draft');

  // Same floor as raffle creation: ticket revenue at capacity must cover
  // every prize tier's value, not just the headline one, since one ticket
  // pool funds all of them. Only worth recomputing when a relevant field
  // is actually part of this update — an untouched combination was already
  // valid when it was first saved.
  if (data.prizeValue !== undefined || data.ticketPrice !== undefined || data.ticketCap !== undefined || data.additionalPrizes !== undefined) {
    const finalPrizeValue = data.prizeValue ?? current.prizeValue;
    const finalTicketPrice = data.ticketPrice ?? current.ticketPrice;
    const finalTicketCap = data.ticketCap ?? current.ticketCap;
    const finalAdditionalPrizes =
      data.additionalPrizes !== undefined
        ? data.additionalPrizes
        : (await listRafflePrizes(id)).filter((p) => p.tier > 1);
    const minTickets = computeMinTicketCap(finalPrizeValue, finalTicketPrice, finalAdditionalPrizes);
    if (finalTicketCap < minTickets) {
      const totalPrizeValue = finalPrizeValue + finalAdditionalPrizes.reduce((sum, p) => sum + p.value, 0);
      throw new AppError(
        400,
        `Needs at least ${minTickets} tickets to cover ${totalPrizeValue.toLocaleString()} ETB in prizes at ${finalTicketPrice.toLocaleString()} ETB/ticket`
      );
    }
  }

  const { additionalPrizes, ...raffleFields } = data;
  const updated = await dbUpdateRaffle(id, raffleFields);
  if (!updated) throw new AppError(404, 'raffle.notFound');
  if (additionalPrizes !== undefined) await setAdditionalRafflePrizes(id, additionalPrizes);
  return withPrizes(updated);
}

const allowedTransitions: Record<DbRaffle['status'], DbRaffle['status'][]> = {
  draft: ['open', 'cancelled'],
  open: ['locked', 'cancelled'],
  locked: ['awaiting_trigger', 'cancelled'],
  awaiting_trigger: ['drawing', 'cancelled'],
  drawing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function changeRaffleStatus(id: string, data: UpdateRaffleStatusInput) {
  const current = await findRaffleById(id);
  if (!current) throw new AppError(404, 'raffle.notFound');
  if (!allowedTransitions[current.status].includes(data.status)) throw new AppError(409, 'raffle.invalidTransition');
  if (data.status === 'open' && current.deadlineAt <= new Date()) throw new AppError(400, 'Deadline must be in the future');
  if (data.status === 'locked' && current.ticketsSold < current.ticketCap) {
    // Selling out isn't the only path to a draw anymore — once the
    // deadline passes, the Platform Owner can lock manually as soon as the
    // minimum (prize-covering) quota has sold, without waiting for every
    // last ticket. Before the deadline, full sellout is still required.
    if (current.deadlineAt > new Date()) {
      throw new AppError(409, 'A raffle can lock only when its ticket quota is full, or its deadline has passed');
    }
    const prizes = await listRafflePrizes(id);
    const minTickets = computeMinTicketCap(current.prizeValue, current.ticketPrice, prizes.filter((p) => p.tier > 1));
    if (current.ticketsSold < minTickets) {
      throw new AppError(
        409,
        `Cannot lock yet — only ${current.ticketsSold} of the required minimum ${minTickets} tickets have sold`
      );
    }
  }
  const updated = await dbUpdateRaffleStatus(id, data.status);
  if (!updated) throw new AppError(404, 'raffle.notFound');
  return toApiRaffle(updated);
}

export async function changeRaffleDeadline(id: string, deadlineAt: Date, reason: string, adminId: string) {
  const current = await findRaffleById(id);
  if (!current) throw new AppError(404, 'raffle.notFound');
  if (!['draft', 'open'].includes(current.status)) throw new AppError(409, 'raffle.invalidTransition');
  if (deadlineAt <= current.deadlineAt) throw new AppError(400, 'The new deadline must extend the current deadline');
  const updated = await extendRaffleDeadline(id, deadlineAt, reason, adminId);
  if (!updated) throw new AppError(404, 'raffle.notFound');
  return toApiRaffle(updated);
}

/**
 * Get a single raffle by ID.
 */
export async function getRaffle(id: string) {
  const raffle = await findRaffleById(id);
  if (!raffle) {
    throw new AppError(404, 'raffle.notFound');
  }
  return withPrizes(raffle);
}

/**
 * List raffles with optional filters.
 */
export async function listRaffles(input: ListRafflesInput) {
  const raffles = await dbListRaffles({
    status: input.status,
    limit: input.limit,
    offset: input.offset,
  });
  return raffles.map(toApiRaffle);
}

/**
 * Hard-delete a single raffle and everything tied to it (tickets,
 * payments, prizes, draw triggers/results, payouts, notifications, room
 * messages — all cascade at the DB level, see Migration 014). Refuses to
 * delete a raffle that has a 'fulfilled' payout on record, since that
 * would erase the only evidence a real prize actually went out.
 */
export async function adminDeleteRaffle(raffleId: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'raffle.notFound');
  const [blockedId] = await findRaffleIdsWithFulfilledPayouts([raffleId]);
  if (blockedId) {
    throw new AppError(
      409,
      `Cannot delete "${raffle.title}" — it has a fulfilled payout on record. Remove financial history first if you're certain.`
    );
  }
  const deleted = await dbDeleteRaffle(raffleId);
  if (!deleted) throw new AppError(404, 'raffle.notFound');
  return deleted;
}

/**
 * Hard-delete multiple raffles in one DB round-trip. Raffles with a
 * fulfilled payout are silently skipped (not deleted) rather than failing
 * the whole batch — the response reports both which were deleted and
 * which were blocked, so the admin can see exactly what happened.
 */
export async function adminBulkDeleteRaffles(ids: string[]) {
  if (!ids.length) throw new AppError(400, 'No raffle IDs provided');
  if (ids.length > 200) throw new AppError(400, 'Too many IDs — maximum 200 per request');
  const blockedIds = await findRaffleIdsWithFulfilledPayouts(ids);
  const blockedSet = new Set(blockedIds);
  const deletableIds = ids.filter((id) => !blockedSet.has(id));
  const deletedIds = await dbBulkDeleteRaffles(deletableIds);
  return { deletedCount: deletedIds.length, deletedIds, blockedIds };
}
