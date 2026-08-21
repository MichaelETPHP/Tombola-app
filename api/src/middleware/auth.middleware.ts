import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AppEnv } from '../types/hono.js';

/**
 * Auth middleware: extracts and verifies the JWT access token from
 * the Authorization header. Attaches the decoded user/admin payload
 * to the Hono context.
 *
 * Token is expected in the format: `Bearer <token>`
 * Access token lives in memory on the frontend, NOT in cookies.
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  try {
    const payload = await verifyAccessToken(token);

    if (payload.role === 'user') {
      c.set('user', {
        id: payload.sub,
        phone: payload.phone,
        role: 'user',
      });
    } else {
      // Admin roles: owner or moderator
      c.set('admin', {
        id: payload.sub,
        role: payload.role,
      });
      // Also set user context for convenience (admins are users too)
      c.set('user', {
        id: payload.sub,
        phone: payload.phone,
        role: 'user',
      });
    }

    await next();
  } catch (_error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
};

/**
 * Extracts the refresh token from the httpOnly cookie.
 * Used only on the /auth/refresh endpoint.
 */
export function getRefreshTokenFromCookie(c: Parameters<MiddlewareHandler>[0]): string | undefined {
  return getCookie(c, 'refresh_token');
}
