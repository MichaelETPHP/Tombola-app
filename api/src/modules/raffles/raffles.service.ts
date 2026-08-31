import {
  createRaffle as dbCreateRaffle,
  findRaffleById,
  listRaffles as dbListRaffles,
  updateRaffle as dbUpdateRaffle,
  updateRaffleStatus as dbUpdateRaffleStatus,
  extendRaffleDeadline,
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

/**
 * Create a new raffle (admin only).
 *
 * The provably-fair server seed is NOT generated here — the schema only
 * has a place to store it on `draw_results`, which can't exist until the
 * raffle locks and a trigger is created. See draws.service.ts for where
 * it's actually generated (at draw execution time).
 */
export async function createRaffle(data: CreateRaffleInput, adminId: string) {
  if (data.deadlineAt && data.deadlineAt <= new Date()) throw new AppError(400, 'Deadline must be in the future');
  if (data.status === 'open' && data.opensAt && data.opensAt > new Date()) {
    throw new AppError(400, 'A future raffle must remain in draft status');
  }
  const drawServerSeed = generateServerSeed();
  const drawServerSeedHash = await commitServerSeed(drawServerSeed);
  const raffle = await dbCreateRaffle({ ...data, createdBy: adminId, drawServerSeed, drawServerSeedHash });
  return toApiRaffle(raffle);
}

export async function updateRaffle(id: string, data: UpdateRaffleInput) {
  const current = await findRaffleById(id);
  if (!current) throw new AppError(404, 'raffle.notFound');
  if (['completed', 'cancelled'].includes(current.status)) throw new AppError(409, 'raffle.invalidTransition');

  const changesTicketRules = data.ticketPrice !== undefined || data.ticketCap !== undefined || data.maxTicketsPerUser !== undefined;
  if (changesTicketRules && current.ticketsSold > 0) throw new AppError(409, 'raffle.salesLocked');
  if (data.ticketCap !== undefined && data.ticketCap < current.ticketsSold) throw new AppError(400, 'Ticket cap cannot be below tickets already sold');
  if (data.opensAt !== undefined && current.status !== 'draft') throw new AppError(409, 'Opening time can only be changed while the raffle is a draft');

  const updated = await dbUpdateRaffle(id, data);
  if (!updated) throw new AppError(404, 'raffle.notFound');
  return toApiRaffle(updated);
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
  if (data.status === 'locked' && current.ticketsSold < current.ticketCap) throw new AppError(409, 'A raffle can lock only when its ticket quota is full');
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
  return toApiRaffle(raffle);
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
