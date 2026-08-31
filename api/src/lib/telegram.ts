import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.middleware.js';
import { logger } from './logger.js';

export interface TelegramIdentity {
  userId: string;
  username?: string;
  fullName?: string;
  photoUrl?: string;
  phone?: string;
}

interface MiniAppUser {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

const telegramJwks = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json')
);

function requireTelegramBotToken(): string {
  if (!env.TELEGRAM_BOT_TOKEN) throw new AppError(503, 'auth.telegramNotConfigured');
  return env.TELEGRAM_BOT_TOKEN.trim();
}

function safeEqualHex(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

/** Validate the raw query string supplied by Telegram.WebApp.initData. */
export function validateMiniAppInitData(initData: string): TelegramIdentity {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') ?? '';
  const authDate = Number(params.get('auth_date'));
  const userJson = params.get('user');

  if (!receivedHash || !Number.isFinite(authDate) || !userJson) {
    logger.warn('Telegram Mini App validation rejected', { reason: 'missing_signed_fields' });
    throw new AppError(401, 'auth.telegramInvalid');
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds < -30 || ageSeconds > env.TELEGRAM_AUTH_MAX_AGE_SECONDS) {
    logger.warn('Telegram Mini App validation rejected', {
      reason: 'expired',
      ageSeconds,
      maxAgeSeconds: env.TELEGRAM_AUTH_MAX_AGE_SECONDS,
    });
    throw new AppError(401, 'auth.telegramExpired');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(requireTelegramBotToken())
    .digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualHex(receivedHash, expectedHash)) {
    logger.warn('Telegram Mini App validation rejected', { reason: 'signature_mismatch' });
    throw new AppError(401, 'auth.telegramInvalid');
  }

  let user: MiniAppUser;
  try {
    user = JSON.parse(userJson) as MiniAppUser;
  } catch {
    logger.warn('Telegram Mini App validation rejected', { reason: 'invalid_user_json' });
    throw new AppError(401, 'auth.telegramInvalid');
  }
  if (!user.id || !user.first_name) {
    logger.warn('Telegram Mini App validation rejected', { reason: 'invalid_user' });
    throw new AppError(401, 'auth.telegramInvalid');
  }

  return {
    userId: String(user.id),
    username: user.username,
    fullName: [user.first_name, user.last_name].filter(Boolean).join(' '),
    photoUrl: user.photo_url,
  };
}

export interface SharedContact {
  telegramUserId: string;
  phone: string;
  // Best-effort identity from the webhook's own `message.from` — no photo
  // is available here (that needs a separate getUserProfilePhotos call);
  // the richer identity captured from initData at Mini App launch fills
  // that in once the poll endpoint sees this link land.
  fullName: string;
  username?: string;
}

interface TelegramWebhookUpdate {
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    contact?: {
      phone_number?: string;
      user_id?: number;
    };
  };
}

/**
 * Extract a verified shared phone number from an inbound Telegram webhook
 * update, or null if this update isn't a contact share at all (most
 * updates the bot receives won't be — every other message type, edits,
 * etc. all pass through here too).
 *
 * `WebApp.requestContact()` never exposes the phone number to the Mini
 * App's own JavaScript (confirmed against Telegram's docs) — Telegram
 * delivers it only here, as an ordinary message with a populated
 * `contact` field, in the private chat between the user and the bot. The
 * `contact.user_id === message.from.id` check matters because Telegram's
 * classic contact-share UI (unlike requestContact, but this endpoint has
 * no way to tell which UI produced a given update) technically allows
 * choosing *any* contact from the phonebook, not just your own — without
 * this check, a user could share a friend's number and claim it as their
 * own account's identity.
 */
export function extractSharedContact(update: TelegramWebhookUpdate): SharedContact | null {
  const message = update.message;
  const contact = message?.contact;
  if (!message || !contact || message.chat?.type !== 'private') return null;
  if (!contact.phone_number || !contact.user_id || !message.from?.id) return null;
  if (contact.user_id !== message.from.id) return null;

  const raw = contact.phone_number.replace(/[^\d+]/g, '');
  const phone = raw.startsWith('+') ? raw : `+${raw}`;

  return {
    telegramUserId: String(message.from.id),
    phone,
    fullName: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'Telegram user',
    username: message.from.username,
  };
}

/** Verify the OIDC ID token returned by Telegram Login on the standalone app. */
export async function validateTelegramIdToken(
  idToken: string,
  expectedNonce: string
): Promise<TelegramIdentity> {
  if (!env.TELEGRAM_CLIENT_ID) throw new AppError(503, 'auth.telegramNotConfigured');

  const { payload } = await jwtVerify(idToken, telegramJwks, {
    issuer: 'https://oauth.telegram.org',
    audience: env.TELEGRAM_CLIENT_ID,
    algorithms: ['RS256', 'ES256'],
  });

  if (payload.nonce !== expectedNonce) throw new AppError(401, 'auth.telegramInvalid');

  const userId = String(payload.id ?? payload.sub ?? '');
  const phoneClaim = payload.phone_number_verified === true && typeof payload.phone_number === 'string'
    ? payload.phone_number
    : '';
  if (!userId) throw new AppError(401, 'auth.telegramInvalid');

  return {
    userId,
    username: typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined,
    fullName: typeof payload.name === 'string' ? payload.name : undefined,
    photoUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
    phone: phoneClaim ? (phoneClaim.startsWith('+') ? phoneClaim : `+${phoneClaim}`) : undefined,
  };
}
