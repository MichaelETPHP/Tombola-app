import { listUsers, setUserSuspended } from '../../db/queries/users.queries.js';
import { listRaffles } from '../../db/queries/raffles.queries.js';
import { findExpiringPayouts } from '../../db/queries/payouts.queries.js';
import { findAdminByPhone } from '../../db/queries/admin.queries.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { env } from '../../config/env.js';

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

  return [otp, chapa, telebirr];
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
    admin: {
      id: admin.id,
      email: `${admin.phoneNumber.replace('+', '')}@admin.tombola.local`,
      fullName: admin.role === 'owner' ? 'Platform Owner' : 'Platform Moderator',
      role: admin.role,
    },
  };
}
