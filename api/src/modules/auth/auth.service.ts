import {
  findUserByPhone,
  findUserById,
  findUserByTelegramId,
  createUser,
  linkTelegramIdentity,
  bumpSessionVersion,
  type DbUser,
} from '../../db/queries/users.queries.js';
import { findAdminById } from '../../db/queries/admin.queries.js';
import { createOtpCode, deleteExpiredOtps, findLatestOtp, incrementOtpAttempts, markOtpVerified } from '../../db/queries/otp.queries.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signTelegramLinkToken,
  verifyTelegramLinkToken,
  verifyTelegramNonceToken,
} from '../../lib/jwt.js';
import {
  validateMiniAppInitData,
  validateTelegramIdToken,
  type TelegramIdentity,
  type SharedContact,
} from '../../lib/telegram.js';
import { sendOtp } from '../../lib/sms.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { env } from '../../config/env.js';
import type { Locale } from '../../lib/i18n.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000;

function generateOtpCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

export async function requestOtp(phone: string, locale: Locale = 'en'): Promise<{ messageKey: string; expiresIn: number }> {
  const code = generateOtpCode();
  const existingUser = await findUserByPhone(phone);
  const codeHash = await Bun.password.hash(code, { algorithm: 'bcrypt', cost: 8 });

  await createOtpCode({
    phoneNumber: phone,
    codeHash,
    purpose: existingUser ? 'login' : 'signup',
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });
  void deleteExpiredOtps().catch((error) => logger.warn(`OTP cleanup failed: ${String(error)}`));

  const result = await sendOtp(phone, code, locale);
  if (!result.success) {
    logger.error(`Failed to send OTP to ${phone}: ${result.error}`);
    throw new AppError(502, 'auth.otpSendFailed');
  }

  logger.info(`OTP requested for ${phone}`);
  return { messageKey: 'auth.otpSent', expiresIn: OTP_EXPIRY_MS / 1000 };
}

function publicUser(user: DbUser, isNewUser = false) {
  return {
    id: user.id,
    phone: user.phoneNumber,
    fullName: user.fullName,
    preferredLanguage: user.preferredLanguage,
    telegramLinked: Boolean(user.telegramUserId),
    telegramUsername: user.telegramUsername,
    telegramPhotoUrl: user.telegramPhotoUrl,
    isNewUser,
  };
}

async function createSession(user: DbUser, isNewUser = false) {
  if (user.status !== 'active') throw new AppError(403, 'auth.accountSuspended');
  // One active session per account: this login supersedes any other device
  // already signed in on this phone number.
  const sessionVersion = await bumpSessionVersion(user.id);
  return {
    accessToken: await signAccessToken({ sub: user.id, phone: user.phoneNumber, role: 'user', sessionVersion }),
    refreshToken: await signRefreshToken({ sub: user.id, role: 'user', sessionVersion }),
    user: publicUser(user, isNewUser),
  };
}

async function attachTelegram(user: DbUser, identity: TelegramIdentity): Promise<DbUser> {
  const alreadyLinked = await findUserByTelegramId(identity.userId);
  if (alreadyLinked && alreadyLinked.id !== user.id) {
    throw new AppError(409, 'auth.telegramAlreadyLinked');
  }
  const linked = await linkTelegramIdentity(user.id, identity);
  if (!linked) throw new AppError(409, 'auth.telegramAlreadyLinked');
  return linked;
}

export async function verifyOtp(phone: string, code: string, telegramLinkToken?: string) {
  // DEMO_OTP_ENABLED is an explicit opt-in used by deployed test stacks as
  // well as local development. /health keeps production deployments visibly
  // degraded until this flag is disabled and a real SMS gateway is wired.
  const allowDemoCode = env.DEMO_OTP_ENABLED && code === '123456';
  const stored = await findLatestOtp(phone);

  if (!stored && !allowDemoCode) throw new AppError(400, 'auth.otpMissing');

  if (stored && !allowDemoCode) {
    if (stored.expiresAt.getTime() <= Date.now()) throw new AppError(400, 'auth.otpExpired');
    if (stored.attempts >= stored.maxAttempts) throw new AppError(429, 'auth.tooManyAttempts');

    await incrementOtpAttempts(stored.id);
    const valid = await Bun.password.verify(code, stored.codeHash).catch(() => false);
    if (!valid) throw new AppError(400, 'auth.otpInvalid');
    await markOtpVerified(stored.id);
  } else if (stored) {
    await markOtpVerified(stored.id);
  }

  let user = await findUserByPhone(phone);
  let isNewUser = false;
  if (!user) {
    user = await createUser(phone);
    isNewUser = true;
    logger.info(`New user registered: ${phone}`);
  }
  if (telegramLinkToken) {
    const telegram = await verifyTelegramLinkToken(telegramLinkToken);
    user = await attachTelegram(user, {
      userId: telegram.telegramUserId,
      username: telegram.username,
      photoUrl: telegram.photoUrl,
      fullName: telegram.fullName,
    });
  }
  return createSession(user, isNewUser);
}

export async function authenticateTelegramMiniApp(initData: string) {
  const identity = validateMiniAppInitData(initData);
  const user = await findUserByTelegramId(identity.userId);
  if (user) return { status: 'authenticated' as const, ...(await createSession(user)) };

  // First time this Telegram account has opened the Mini App. Inside the
  // bot there's no OTP fallback at all — the frontend calls
  // WebApp.requestContact() next, Telegram delivers the actual phone
  // number to /auth/telegram/webhook (never to the Mini App's own JS,
  // confirmed against Telegram's docs — see extractSharedContact), and
  // the frontend polls completeTelegramMiniAppLogin with this same token
  // until that webhook has finished linking the account.
  return {
    status: 'contact_required' as const,
    telegramLinkToken: await signTelegramLinkToken({
      telegramUserId: identity.userId,
      username: identity.username,
      photoUrl: identity.photoUrl,
      fullName: identity.fullName,
    }),
    telegramUser: {
      fullName: identity.fullName ?? 'Telegram user',
      username: identity.username ?? null,
      photoUrl: identity.photoUrl ?? null,
    },
  };
}

/**
 * Polled by the Mini App frontend after it calls WebApp.requestContact() —
 * returns 'authenticated' once /auth/telegram/webhook has processed the
 * corresponding contact-share update and linked the account, or 'pending'
 * while that's still in flight (webhook delivery is asynchronous and
 * outside this request's control).
 */
export async function completeTelegramMiniAppLogin(telegramLinkToken: string) {
  const pending = await verifyTelegramLinkToken(telegramLinkToken);
  let user = await findUserByTelegramId(pending.telegramUserId);
  if (!user) return { status: 'pending' as const };

  // The webhook linked the account with only what message.from carries
  // (name, username, no photo). This request already holds the richer
  // identity captured from initData at Mini App launch — merge it in now
  // that the account genuinely exists.
  if (!user.telegramPhotoUrl && pending.photoUrl) {
    user =
      (await linkTelegramIdentity(user.id, {
        userId: pending.telegramUserId,
        username: pending.username ?? user.telegramUsername,
        photoUrl: pending.photoUrl,
        fullName: user.fullName,
      })) ?? user;
  }

  return { status: 'authenticated' as const, ...(await createSession(user)) };
}

/**
 * Called from the /auth/telegram/webhook route once a contact share has
 * been verified. Phone is mandatory and unique platform-wide (per product
 * requirement — one identity, whichever way someone signs in), so this
 * links to an existing phone account if one already exists (e.g. someone
 * who first signed up via the APK's SMS flow), or creates a new one.
 *
 * The webhook has no way to show a UI error back to the user in Telegram
 * (that would need an outbound sendMessage call, which is out of scope
 * here) — an invalid/non-Ethiopian number just doesn't get linked, and
 * the frontend's poll eventually times out with a generic "couldn't sign
 * in with this Telegram account" message instead.
 */
export async function linkTelegramContact(contact: SharedContact): Promise<void> {
  if (!/^\+251[0-9]{9}$/.test(contact.phone)) {
    logger.warn(`Telegram contact share rejected: not a valid Ethiopian number (telegramUserId=${contact.telegramUserId})`);
    return;
  }

  let user = await findUserByPhone(contact.phone);
  if (!user) {
    user = await createUser(contact.phone);
    logger.info(`New user registered via Telegram contact share: ${contact.phone}`);
  }
  await attachTelegram(user, {
    userId: contact.telegramUserId,
    username: contact.username,
    fullName: contact.fullName,
  });
}

export async function authenticateTelegramOidc(idToken: string, nonceToken: string) {
  const nonce = await verifyTelegramNonceToken(nonceToken);
  const identity = await validateTelegramIdToken(idToken, nonce.nonce);
  let user = await findUserByTelegramId(identity.userId);
  if (user) return { status: 'authenticated' as const, ...(await createSession(user)) };

  // YeneEta currently operates with Ethiopian E.164 numbers. A Telegram
  // account with no shared phone (or a non-Ethiopian number) can still link
  // safely through the normal OTP screen.
  if (!identity.phone || !/^\+251[0-9]{9}$/.test(identity.phone)) {
    return {
      status: 'phone_required' as const,
      telegramLinkToken: await signTelegramLinkToken({
        telegramUserId: identity.userId,
        username: identity.username,
        photoUrl: identity.photoUrl,
        fullName: identity.fullName,
      }),
    };
  }

  user = await findUserByPhone(identity.phone);
  let isNewUser = false;
  if (!user) {
    user = await createUser(identity.phone);
    isNewUser = true;
  }
  user = await attachTelegram(user, identity);
  return { status: 'authenticated' as const, ...(await createSession(user, isNewUser)) };
}

/**
 * Best-effort revocation on top of the cookie deletion the route handler
 * already does. Bumping session_version invalidates this refresh token
 * (and any access token issued alongside it) immediately, rather than
 * leaving it cryptographically valid for up to 30 more days if it was
 * ever copied somewhere else before this logout — the single-session
 * model means this can't log out a *different* legitimate device, since
 * there isn't supposed to be one. Never throws: a missing/expired/already
 *-invalid token just means there's nothing left to revoke, which is a
 * successful logout either way from the caller's point of view.
 */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = await verifyRefreshToken(refreshToken);
    if (payload.role === 'user') await bumpSessionVersion(payload.sub);
  } catch {
    // Already invalid/expired — nothing to revoke.
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const payload = await verifyRefreshToken(refreshToken);

  if (payload.role === 'user') {
    const user = await findUserById(payload.sub);
    if (!user) throw new AppError(401, 'user.notFound');
    if (user.status !== 'active') throw new AppError(403, 'auth.accountSuspended');
    // This refresh token was issued to a device that's since been logged
    // out by a newer login elsewhere (see createSession) — reject rather
    // than silently minting a fresh access token for a superseded session.
    if (payload.sessionVersion !== user.sessionVersion) {
      throw new AppError(401, 'auth.sessionRevoked');
    }
    return {
      accessToken: await signAccessToken({
        sub: user.id,
        phone: user.phoneNumber,
        role: 'user',
        sessionVersion: user.sessionVersion,
      }),
    };
  }

  const admin = await findAdminById(payload.sub);
  if (!admin || admin.role !== payload.role) throw new AppError(401, 'auth.invalidToken');
  return {
    accessToken: await signAccessToken({ sub: admin.id, phone: admin.phoneNumber, role: admin.role }),
  };
}
