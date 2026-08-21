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
}

export interface RefreshTokenPayload {
  sub: string;
  role: 'user' | 'owner' | 'moderator';
  type: 'refresh';
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
