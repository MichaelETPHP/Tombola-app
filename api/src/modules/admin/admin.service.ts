import { listUsers, setUserSuspended } from '../../db/queries/users.queries.js';
import { listRaffles } from '../../db/queries/raffles.queries.js';
import { findExpiringPayouts } from '../../db/queries/payouts.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/**
 * Get admin dashboard overview stats.
 */
export async function getDashboardStats() {
  const [openRaffles, lockedRaffles, expiringPayouts] = await Promise.all([
    listRaffles({ status: 'open', limit: 100, offset: 0 }),
    listRaffles({ status: 'locked', limit: 100, offset: 0 }),
    findExpiringPayouts(),
  ]);

  return {
    activeRaffles: openRaffles.length + lockedRaffles.length,
    openRaffles: openRaffles.length,
    lockedRaffles: lockedRaffles.length,
    pendingPayouts: expiringPayouts.length,
    expiringPayouts: expiringPayouts.map((p) => ({
      id: p.id,
      raffleId: p.raffleId,
      claimDeadline: p.claimDeadline,
      status: p.status,
    })),
  };
}

/**
 * List all users (admin).
 */
export async function adminListUsers(limit: number, offset: number) {
  return listUsers(limit, offset);
}

/**
 * Suspend or unsuspend a user.
 */
export async function adminSuspendUser(userId: string, suspended: boolean) {
  const user = await setUserSuspended(userId, suspended);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}
