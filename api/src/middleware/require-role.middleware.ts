import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types/hono.js';

/**
 * Role-checking middleware factory.
 * Blocks access unless the authenticated user has one of the allowed roles.
 *
 * Usage:
 *   adminRoutes.use('*', requireRole('owner', 'moderator'))
 *   ownerOnlyRoutes.use('*', requireRole('owner'))
 */
export function requireRole(...allowedRoles: Array<'owner' | 'moderator'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get('admin');

    if (!admin) {
      return c.json({ error: 'Admin access required' }, 403);
    }

    if (!allowedRoles.includes(admin.role)) {
      return c.json(
        {
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: admin.role,
        },
        403
      );
    }

    await next();
  };
}
