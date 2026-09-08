import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyAccessToken } from '../lib/jwt.js';
import { findUserById } from '../db/queries/users.queries.js';
import { findAdminById } from '../db/queries/admin.queries.js';
import { isCurrentAdminSession } from '../lib/admin-session.js';
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
    return c.json({ error: c.get('t')('auth.missingToken'), code: 'AUTH_MISSING_TOKEN' }, 401);
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return c.json({ error: c.get('t')('auth.invalidToken'), code: 'AUTH_INVALID_TOKEN' }, 401);
  }

    if (payload.role === 'user') {
      // Single-device enforcement: a newer login elsewhere bumps
      // session_version, which immediately invalidates every token from
      // this one — checked per-request (not just at /auth/refresh) so a
      // superseded device is logged out right away rather than staying
      // valid for up to the access token's remaining 15-minute lifetime.
      const user = await findUserById(payload.sub);
      if (!user || user.status !== 'active' || payload.sessionVersion !== user.sessionVersion) {
        return c.json({ error: c.get('t')('auth.sessionRevoked'), code: 'AUTH_SESSION_REVOKED' }, 401);
      }
      c.set('user', {
        id: payload.sub,
        phone: payload.phone,
        role: 'user',
      });
    } else if (payload.role === 'owner' || payload.role === 'moderator') {
      const admin = await findAdminById(payload.sub);
      if (!isCurrentAdminSession(payload, admin)) {
        return c.json({ error: c.get('t')('admin.sessionRevoked'), code: 'AUTH_SESSION_REVOKED' }, 401);
      }
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
    } else {
      return c.json({ error: c.get('t')('auth.invalidToken'), code: 'AUTH_INVALID_TOKEN' }, 401);
    }

  // Let infrastructure/route failures reach the error handler as their actual
  // status. They must never be disguised as an expired login.
  await next();
};

/**
 * Extracts the refresh token from the httpOnly cookie.
 * Used only on the /auth/refresh endpoint.
 */
export function getRefreshTokenFromCookie(c: Parameters<MiddlewareHandler>[0]): string | undefined {
  return getCookie(c, 'refresh_token');
}
