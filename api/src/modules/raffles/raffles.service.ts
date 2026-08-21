import {
  createRaffle as dbCreateRaffle,
  findRaffleById,
  listRaffles as dbListRaffles,
} from '../../db/queries/raffles.queries.js';
import { generateServerSeed, commitServerSeed } from '../../lib/provably-fair.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { CreateRaffleInput, ListRafflesInput } from './raffles.schema.js';

/**
 * Create a new raffle (admin only).
 * Generates a server seed and commits its hash for provably-fair draws.
 */
export async function createRaffle(data: CreateRaffleInput, adminId: string) {
  const serverSeed = generateServerSeed();
  const serverSeedHash = await commitServerSeed(serverSeed);

  const raffle = await dbCreateRaffle({
    ...data,
    serverSeedHash,
    serverSeed,
    createdBy: adminId,
  });

  return {
    ...raffle,
    // Never expose the raw server seed before the draw
    serverSeed: undefined,
    serverSeedHash: raffle.serverSeedHash,
  };
}

/**
 * Get a single raffle by ID.
 */
export async function getRaffle(id: string) {
  const raffle = await findRaffleById(id);
  if (!raffle) {
    throw new AppError(404, 'Raffle not found');
  }

  // Hide server seed if draw hasn't completed
  if (raffle.status !== 'completed') {
    return { ...raffle, serverSeed: undefined };
  }

  return raffle;
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

  // Strip server seeds from non-completed raffles
  return raffles.map((r) => ({
    ...r,
    serverSeed: r.status === 'completed' ? r.serverSeed : undefined,
  }));
}
