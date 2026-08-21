import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { requestOtpSchema, verifyOtpSchema } from './auth.schema.js';
import { requestOtp, verifyOtp, refreshAccessToken } from './auth.service.js';
import { getRefreshTokenFromCookie } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const authRoutes = new Hono<AppEnv>();

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

    const result = await requestOtp(phone);
    return c.json(result, 200);
  }
);

/**
 * POST /auth/otp/verify
 * Verify OTP and receive JWT tokens.
 * Sets refresh token as httpOnly cookie.
 */
authRoutes.post('/otp/verify', async (c) => {
  const body = await c.req.json();
  const { phone, code } = verifyOtpSchema.parse(body);

  const result = await verifyOtp(phone, code);

  // Set refresh token as httpOnly secure cookie
  setCookie(c, 'refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/auth/refresh',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return c.json(
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    200
  );
});

/**
 * POST /auth/refresh
 * Exchange a valid refresh token (from cookie) for a new access token.
 */
authRoutes.post('/refresh', async (c) => {
  const refreshToken = getRefreshTokenFromCookie(c);

  if (!refreshToken) {
    return c.json({ error: 'No refresh token provided' }, 401);
  }

  const result = await refreshAccessToken(refreshToken);
  return c.json(result, 200);
});
