import * as jose from 'jose';
import { env } from '../config/env.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

/**
 * Encode secrets as Uint8Array for jose.
 */
function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  role: 'user' | 'owner' | 'moderator';
  type: 'access';
  // Only set for role 'user' — enforces one active session per account.
  // Every login bumps the user's session_version in the DB and signs new
  // tokens with that value; a token carrying an older value belongs to a
  // device that's since been superseded by a newer login elsewhere, and
  // gets rejected the next time it's used. Admin sessions don't carry this
  // (no single-device policy for the dashboard).
  sessionVersion?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  role: 'user' | 'owner' | 'moderator';
  type: 'refresh';
  sessionVersion?: number;
}

export interface TelegramLinkPayload {
  type: 'telegram_link';
  telegramUserId: string;
  username?: string;
  photoUrl?: string;
  fullName?: string;
}

export interface TelegramNoncePayload {
  type: 'telegram_nonce';
  nonce: string;
}

/**
 * Sign a short-lived access token (15 min).
 */
export async function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): Promise<string> {
  return new jose.SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('tombola-api')
    .sign(getSecret(env.JWT_ACCESS_SECRET));
}

/**
 * Sign a long-lived refresh token (30 days).
 */
export async function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): Promise<string> {
  return new jose.SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer('tombola-api')
    .sign(getSecret(env.JWT_REFRESH_SECRET));
}

/**
 * Verify and decode an access token.
 * Throws if expired, invalid, or wrong type.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret(env.JWT_ACCESS_SECRET), {
    issuer: 'tombola-api',
  });

  if (payload.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }

  return payload as unknown as AccessTokenPayload;
}

/**
 * Verify and decode a refresh token.
 * Throws if expired, invalid, or wrong type.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret(env.JWT_REFRESH_SECRET), {
    issuer: 'tombola-api',
  });

  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type: expected refresh token');
  }

  return payload as unknown as RefreshTokenPayload;
}

export async function signTelegramLinkToken(
  identity: Omit<TelegramLinkPayload, 'type'>
): Promise<string> {
  return new jose.SignJWT({ ...identity, type: 'telegram_link' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .setIssuer('tombola-api')
    .sign(getSecret(env.JWT_ACCESS_SECRET));
}

export async function verifyTelegramLinkToken(token: string): Promise<TelegramLinkPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret(env.JWT_ACCESS_SECRET), {
    issuer: 'tombola-api',
  });
  if (payload.type !== 'telegram_link') throw new Error('Invalid Telegram link token');
  return payload as unknown as TelegramLinkPayload;
}

export async function createTelegramNonce(): Promise<{ nonce: string; nonceToken: string }> {
  const nonce = crypto.randomUUID();
  const nonceToken = await new jose.SignJWT({ nonce, type: 'telegram_nonce' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setIssuer('tombola-api')
    .sign(getSecret(env.JWT_ACCESS_SECRET));
  return { nonce, nonceToken };
}

export async function verifyTelegramNonceToken(token: string): Promise<TelegramNoncePayload> {
  const { payload } = await jose.jwtVerify(token, getSecret(env.JWT_ACCESS_SECRET), {
    issuer: 'tombola-api',
  });
  if (payload.type !== 'telegram_nonce') throw new Error('Invalid Telegram nonce token');
  return payload as unknown as TelegramNoncePayload;
}
