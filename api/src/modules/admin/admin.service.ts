import { listUsers, setUserSuspended, deleteUser, bulkDeleteUsers } from '../../db/queries/users.queries.js';
import { listRaffles } from '../../db/queries/raffles.queries.js';
import { findExpiringPayouts } from '../../db/queries/payouts.queries.js';
import {
  findAdminByPhone,
  findAdminById,
  listAdmins as dbListAdmins,
  countAdminsByRole,
  createAdmin as dbCreateAdmin,
  updateAdmin as dbUpdateAdmin,
  deleteAdmin as dbDeleteAdmin,
  type DbAdminUser,
} from '../../db/queries/admin.queries.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { env } from '../../config/env.js';
import type { UpdateOwnProfileInput, CreateAdminInput, UpdateAdminInput } from './admin.schema.js';

export type IntegrationMode = 'mock' | 'live' | 'unconfigured' | 'not_implemented';

export interface IntegrationStatus {
  key: string;
  name: string;
  mode: IntegrationMode;
  detail: string;
}

/** A .env.example placeholder left untouched — not a real credential. */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.startsWith('your-') || value.includes('example.com');
}


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
      status: p.claimStatus,
    })),
  };
}

/**
 * Status of every external integration this platform depends on — never
 * exposes actual secret values, only whether each looks configured and
 * which mode (mock/live) is currently active. Read-only: real credentials
 * are set via deployment environment variables, not through this API.
 */
export function getIntegrationsStatus(): IntegrationStatus[] {
  const smsConfigured = !isPlaceholder(env.SMS_API_URL) && !isPlaceholder(env.SMS_API_KEY);
  const otp: IntegrationStatus = env.DEMO_OTP_ENABLED
    ? {
        key: 'otp',
        name: 'OTP delivery (SMS)',
        mode: 'mock',
        detail: '123456 is accepted as the code for any phone number. Set DEMO_OTP_ENABLED=false once a real gateway is live.',
      }
    : smsConfigured
      ? { key: 'otp', name: 'OTP delivery (SMS)', mode: 'live', detail: 'SMS_API_URL and SMS_API_KEY are set — codes send for real.' }
      : {
          key: 'otp',
          name: 'OTP delivery (SMS)',
          mode: 'unconfigured',
          detail: 'No SMS gateway configured — codes are logged to the server console instead of sent.',
        };

  const chapaConfigured = !isPlaceholder(env.CHAPA_SECRET_KEY) && !isPlaceholder(env.CHAPA_WEBHOOK_SECRET);
  const chapa: IntegrationStatus = env.MOCK_PAYMENTS
    ? {
        key: 'chapa',
        name: 'Chapa payments',
        mode: 'mock',
        detail: 'Checkout goes through the mobile app’s fake gateway page. Ticket issuance and the webhook still run for real. Set MOCK_PAYMENTS=false once CHAPA_SECRET_KEY is live.',
      }
    : chapaConfigured
      ? { key: 'chapa', name: 'Chapa payments', mode: 'live', detail: 'CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET are set — real checkout is active.' }
      : { key: 'chapa', name: 'Chapa payments', mode: 'unconfigured', detail: 'No Chapa credentials set and MOCK_PAYMENTS is off — real purchases will fail.' };

  const telebirrConfigured = !isPlaceholder(env.TELEBIRR_APP_ID) && !isPlaceholder(env.TELEBIRR_APP_KEY);
  const telebirr: IntegrationStatus = {
    key: 'telebirr',
    name: 'Telebirr payments',
    mode: 'not_implemented',
    detail: telebirrConfigured
      ? 'App ID/key are set, but there is no Telebirr integration code yet — this is schema-level only for now.'
      : 'Not built yet — the payments schema reserves this gateway, but no integration code exists.',
  };

  const storage: IntegrationStatus = {
    key: 'storage',
    name: 'Raffle image storage',
    mode: 'live',
    detail: 'Optimized WebP prize images are saved to the API’s local disk (persisted via the api_uploads Docker volume) — no external config needed.',
  };

  return [otp, chapa, storage, telebirr];
}

/**
 * Shape the API exposes for a user row — keeps `phone`/`isSuspended` stable
 * for admin-app even though the DB stores `phone_number`/a `status` enum.
 */
function toAdminUser(user: {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  telegramLinkedAt: Date | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    phone: user.phoneNumber,
    fullName: user.fullName,
    authMethod: user.telegramUserId ? 'telegram' as const : 'phone_otp' as const,
    telegramUsername: user.telegramUsername,
    telegramPhotoUrl: user.telegramPhotoUrl,
    telegramLinkedAt: user.telegramLinkedAt,
    isSuspended: user.status !== 'active',
    createdAt: user.createdAt,
  };
}

/**
 * List all users (admin).
 */
export async function adminListUsers(limit: number, offset: number) {
  const users = await listUsers(limit, offset);
  return users.map(toAdminUser);
}

/**
 * Suspend or unsuspend a user.
 */
export async function adminSuspendUser(userId: string, suspended: boolean) {
  const user = await setUserSuspended(userId, suspended);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return toAdminUser(user);
}

/**
 * Shape the API exposes for an admin — email stays synthesized (login is
 * by phone, there's no real email column), but fullName is now real,
 * stored data. The role-based generic string is only a fallback for
 * admins created before this existed and never renamed themselves.
 */
function toPublicAdmin(admin: DbAdminUser) {
  return {
    id: admin.id,
    phone: admin.phoneNumber,
    email: `${admin.phoneNumber.replace('+', '')}@admin.tombola.local`,
    fullName: admin.fullName ?? (admin.role === 'owner' ? 'Platform Owner' : 'Platform Moderator'),
    role: admin.role,
    createdAt: admin.createdAt,
  };
}

/**
 * Authenticate admin with phone/email and password.
 */
export async function adminLogin(phone?: string, password?: string) {
  if (!password) {
    throw new AppError(400, 'auth.invalidCredentials');
  }

  const admin = phone ? await findAdminByPhone(phone) : null;

  if (!admin) {
    throw new AppError(401, 'auth.invalidCredentials');
  }

  // Verify password using Bun.password
  const isMatch = await Bun.password.verify(password, admin.passwordHash).catch(() => false);
  if (!isMatch) {
    throw new AppError(401, 'auth.invalidCredentials');
  }

  // Sign access and refresh tokens
  const accessToken = await signAccessToken({
    sub: admin.id,
    phone: admin.phoneNumber,
    role: admin.role,
  });

  const refreshToken = await signRefreshToken({
    sub: admin.id,
    role: admin.role,
  });

  return {
    accessToken,
    refreshToken,
    admin: toPublicAdmin(admin),
  };
}

/**
 * Self-service profile edit — name always allowed; changing the password
 * requires confirming the current one even though the request is already
 * authenticated (an unlocked/left-open session alone shouldn't be enough
 * to lock the real owner out of their own account).
 */
export async function updateOwnAdminProfile(adminId: string, data: UpdateOwnProfileInput) {
  const admin = await findAdminById(adminId);
  if (!admin) throw new AppError(404, 'Admin not found');

  const updates: { fullName?: string; passwordHash?: string } = {};
  if (data.fullName !== undefined) updates.fullName = data.fullName;

  if (data.newPassword) {
    const isMatch = await Bun.password.verify(data.currentPassword ?? '', admin.passwordHash).catch(() => false);
    if (!isMatch) throw new AppError(401, 'auth.invalidCredentials');
    updates.passwordHash = await Bun.password.hash(data.newPassword, { algorithm: 'bcrypt', cost: 10 });
  }

  const updated = await dbUpdateAdmin(adminId, updates);
  if (!updated) throw new AppError(404, 'Admin not found');
  return toPublicAdmin(updated);
}

/** Owner-only: every admin account, oldest first. */
export async function listAdminUsers() {
  const admins = await dbListAdmins();
  return admins.map(toPublicAdmin);
}

/** Owner-only: create a new admin account — the only way to add one until now was seeding the DB directly. */
export async function createAdminUser(data: CreateAdminInput) {
  const existing = await findAdminByPhone(data.phone);
  if (existing) throw new AppError(409, 'admin.phoneTaken');

  const passwordHash = await Bun.password.hash(data.password, { algorithm: 'bcrypt', cost: 10 });
  const admin = await dbCreateAdmin({
    phoneNumber: data.phone,
    passwordHash,
    fullName: data.fullName,
    role: data.role,
  });
  return toPublicAdmin(admin);
}

/**
 * Owner-only: edit another admin's name/role. Refuses to demote the last
 * remaining owner — that would lock every owner-only action (creating
 * admins, deleting users, viewing integration credentials) out entirely,
 * with no account left able to undo it.
 */
export async function updateAdminUser(id: string, data: UpdateAdminInput) {
  const admin = await findAdminById(id);
  if (!admin) throw new AppError(404, 'Admin not found');

  if (data.role === 'moderator' && admin.role === 'owner') {
    const ownerCount = await countAdminsByRole('owner');
    if (ownerCount <= 1) throw new AppError(409, 'admin.lastOwnerDemote');
  }

  const updated = await dbUpdateAdmin(id, data);
  if (!updated) throw new AppError(404, 'Admin not found');
  return toPublicAdmin(updated);
}

/**
 * Owner-only: remove an admin account. Refuses self-deletion (use another
 * owner's account for that) and refuses removing the last owner, for the
 * same lockout reason as the demotion guard above.
 */
export async function deleteAdminUser(id: string, requestingAdminId: string) {
  if (id === requestingAdminId) throw new AppError(400, 'admin.cannotDeleteSelf');

  const admin = await findAdminById(id);
  if (!admin) throw new AppError(404, 'Admin not found');

  if (admin.role === 'owner') {
    const ownerCount = await countAdminsByRole('owner');
    if (ownerCount <= 1) throw new AppError(409, 'admin.lastOwnerDelete');
  }

  const deleted = await dbDeleteAdmin(id);
  if (!deleted) throw new AppError(404, 'Admin not found');
  return { id: deleted.id };
}
/**
 * Hard-delete a single user (admin only).
 */
export async function adminDeleteUser(userId: string) {
  const deleted = await deleteUser(userId);
  if (!deleted) {
    throw new AppError(404, 'User not found');
  }
  return { id: deleted.id, phone: deleted.phoneNumber };
}

/**
 * Hard-delete multiple users in one DB round-trip.
 * Returns an object with deletedCount and the deleted IDs.
 */
export async function adminBulkDeleteUsers(ids: string[]) {
  if (!ids.length) throw new AppError(400, 'No user IDs provided');
  if (ids.length > 200) throw new AppError(400, 'Too many IDs — maximum 200 per request');
  const deletedIds = await bulkDeleteUsers(ids);
  return { deletedCount: deletedIds.length, deletedIds };
}

/**
 * Retrieve profile information for the authenticated admin.
 */
export async function getAdminProfile(adminId: string) {
  const admin = await findAdminById(adminId);
  if (!admin) {
    throw new AppError(404, 'Admin not found');
  }
  return toPublicAdmin(admin);
}
