import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { requestOtpSchema, verifyOtpSchema, telegramMiniAppSchema, telegramOidcSchema } from './auth.schema.js';
import {
  requestOtp,
  verifyOtp,
  refreshAccessToken,
  authenticateTelegramMiniApp,
  authenticateTelegramOidc,
} from './auth.service.js';
import { getRefreshTokenFromCookie } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';
import { env } from '../../config/env.js';
import { createTelegramNonce } from '../../lib/jwt.js';

export const authRoutes = new Hono<AppEnv>();

function setRefreshCookie(c: Parameters<typeof setCookie>[0], refreshToken: string) {
  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

/**
 * POST /auth/otp/request
 * Send an OTP to the provided phone number.
 * Rate limited: 5 requests per 5 minutes per IP.
 */
authRoutes.post(
  '/otp/request',
  rateLimit({ max: 5, windowSeconds: 300 }),
  async (c) => {
    const body = await c.req.json();
    const { phone } = requestOtpSchema.parse(body);

    const result = await requestOtp(phone, c.get('locale'));
    return c.json({ message: c.get('t')(result.messageKey), expiresIn: result.expiresIn }, 200);
  }
);

/**
 * POST /auth/otp/verify
 * Verify OTP and receive JWT tokens.
 * Sets refresh token as httpOnly cookie.
 */
authRoutes.post('/otp/verify', rateLimit({ max: 10, windowSeconds: 300 }), async (c) => {
  const body = await c.req.json();
  const { phone, code, telegramLinkToken } = verifyOtpSchema.parse(body);

  const result = await verifyOtp(phone, code, telegramLinkToken);

  // Set refresh token as httpOnly secure cookie
  setRefreshCookie(c, result.refreshToken);

  return c.json(
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    200
  );
});

authRoutes.post('/telegram/mini-app', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  const { initData } = telegramMiniAppSchema.parse(await c.req.json());
  const result = await authenticateTelegramMiniApp(initData);
  if (result.status === 'authenticated') setRefreshCookie(c, result.refreshToken);
  const { refreshToken: _refreshToken, ...response } = result.status === 'authenticated'
    ? result
    : { ...result, refreshToken: undefined };
  return c.json(response, 200);
});

authRoutes.post('/telegram/nonce', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  if (!env.TELEGRAM_CLIENT_ID) {
    return c.json({ error: 'Telegram login is not configured', code: 'TELEGRAM_NOT_CONFIGURED' }, 503);
  }
  return c.json({ ...(await createTelegramNonce()), clientId: env.TELEGRAM_CLIENT_ID }, 200);
});

authRoutes.post('/telegram/oidc', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  const { idToken, nonceToken } = telegramOidcSchema.parse(await c.req.json());
  const result = await authenticateTelegramOidc(idToken, nonceToken);
  if ('refreshToken' in result) {
    setRefreshCookie(c, result.refreshToken);
    const { refreshToken: _refreshToken, ...response } = result;
    return c.json(response, 200);
  }
  return c.json(result, 200);
});

/**
 * POST /auth/refresh
 * Exchange a valid refresh token (from cookie) for a new access token.
 */
authRoutes.post('/refresh', rateLimit({ max: 30, windowSeconds: 300 }), async (c) => {
  const refreshToken = getRefreshTokenFromCookie(c);

  if (!refreshToken) {
    return c.json({ error: c.get('t')('auth.invalidToken'), code: 'AUTH_REFRESH_REQUIRED' }, 401);
  }

  const result = await refreshAccessToken(refreshToken);
  return c.json(result, 200);
});

/**
 * POST /auth/logout
 * Clears the refresh token cookie so this browser can't silently mint a
 * new access token on its next visit. Refresh tokens are stateless JWTs
 * (no session table to revoke server-side) — this stops the cookie from
 * being *sent* again, which is what actually matters for "does reopening
 * the app sign me back in", but the token itself stays cryptographically
 * valid until it expires (30d) if it were extracted some other way.
 */
authRoutes.post('/logout', async (c) => {
  deleteCookie(c, 'refresh_token', { path: '/' });
  return c.json({ message: c.get('t')('auth.loggedOut') }, 200);
});
