import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { listUsersSchema, suspendUserSchema, adminLoginSchema } from './admin.schema.js';
import { getDashboardStats, adminListUsers, adminSuspendUser, adminLogin, getIntegrationsStatus } from './admin.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import type { AppEnv } from '../../types/hono.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';

export const adminRoutes = new Hono<AppEnv>();

/**
 * POST /admin/auth/login
 * Admin login endpoint (public, unauthenticated).
 */
adminRoutes.post('/auth/login', rateLimit({ max: 5, windowSeconds: 900 }), async (c) => {
  const body = await c.req.json();
  const input = adminLoginSchema.parse(body);
  const result = await adminLogin(input.phone, input.password);

  setCookie(c, 'refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json({
    accessToken: result.accessToken,
    admin: result.admin,
  });
});

// All subsequent admin routes require auth + admin role
adminRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));


/**
 * GET /admin/dashboard
 * Overview stats for the admin dashboard.
 */
adminRoutes.get('/dashboard', async (c) => {
  const stats = await getDashboardStats();
  return c.json(stats);
});

/**
 * GET /admin/integrations
 * Status of external integrations (SMS/OTP, Chapa, Telebirr) — mock vs
 * live, and whether credentials look configured. Never returns secret
 * values. Owner-only: it's infrastructure/security-adjacent information
 * moderators don't need.
 */
adminRoutes.get('/integrations', requireRole('owner'), async (c) => {
  return c.json({ integrations: getIntegrationsStatus() });
});

/**
 * GET /admin/users
 * List all users with pagination.
 */
adminRoutes.get('/users', async (c) => {
  const query = c.req.query();
  const { limit, offset } = listUsersSchema.parse(query);
  const users = await adminListUsers(limit, offset);
  return c.json({ users });
});

/**
 * PATCH /admin/users/:id/suspend
 * Suspend or unsuspend a user.
 */
adminRoutes.patch('/users/:id/suspend', async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { suspended } = suspendUserSchema.parse(body);
  const user = await adminSuspendUser(userId, suspended);
  return c.json({ user });
});
