import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  listUsersSchema,
  suspendUserSchema,
  adminLoginSchema,
  updateOwnProfileSchema,
  createAdminSchema,
  updateAdminSchema,
  listAuditLogSchema,
} from './admin.schema.js';
import {
  getDashboardStats,
  adminListUsers,
  adminSuspendUser,
  adminLogin,
  getIntegrationsStatus,
  adminDeleteUser,
  adminBulkDeleteUsers,
  getAdminProfile,
  updateOwnAdminProfile,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAuditLog,
} from './admin.service.js';
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
 * GET /admin/auth/me
 * Returns current authenticated admin user profile.
 */
adminRoutes.get('/auth/me', async (c) => {
  const adminCtx = c.get('admin');
  if (!adminCtx) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const admin = await getAdminProfile(adminCtx.id);
  return c.json({ admin });
});

/**
 * PATCH /admin/auth/me
 * Self-service profile edit — any admin can rename themselves or change
 * their own password (with current-password confirmation). Role changes
 * aren't allowed here — that's owner-only, via /admin/admins/:id below.
 */
adminRoutes.patch('/auth/me', async (c) => {
  const adminCtx = c.get('admin');
  const data = updateOwnProfileSchema.parse(await c.req.json());
  const admin = await updateOwnAdminProfile(adminCtx.id, data);
  return c.json({ admin });
});

/**
 * GET /admin/admins
 * Every admin account. Owner-only — a moderator doesn't need visibility
 * into who else has platform access.
 */
adminRoutes.get('/admins', requireRole('owner'), async (c) => {
  const admins = await listAdminUsers();
  return c.json({ admins });
});

/**
 * POST /admin/admins
 * Create a new admin account. Owner-only — previously the only way to
 * add one at all was seeding the database directly.
 */
adminRoutes.post('/admins', requireRole('owner'), async (c) => {
  const data = createAdminSchema.parse(await c.req.json());
  const admin = await createAdminUser(data);
  return c.json({ admin }, 201);
});

/**
 * PATCH /admin/admins/:id
 * Edit another admin's name/role. Owner-only; refuses to demote the last
 * remaining owner (see admin.service.ts for why).
 */
adminRoutes.patch('/admins/:id', requireRole('owner'), async (c) => {
  const data = updateAdminSchema.parse(await c.req.json());
  const admin = await updateAdminUser(c.req.param('id'), data);
  return c.json({ admin });
});

/**
 * DELETE /admin/admins/:id
 * Remove an admin account. Owner-only; refuses self-deletion and refuses
 * removing the last remaining owner.
 */
adminRoutes.delete('/admins/:id', requireRole('owner'), async (c) => {
  const adminCtx = c.get('admin');
  const result = await deleteAdminUser(c.req.param('id'), adminCtx.id);
  return c.json({ deleted: result });
});

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
 * GET /admin/audit-log
 * List audit log entries, newest first, with optional entity/actor filters.
 */
adminRoutes.get('/audit-log', async (c) => {
  const input = listAuditLogSchema.parse(c.req.query());
  const entries = await getAuditLog(input);
  return c.json({ entries });
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

/**
 * DELETE /admin/users/:id
 * Hard-delete a single user. Owner-only.
 */
adminRoutes.delete('/users/:id', requireRole('owner'), async (c) => {
  const userId = c.req.param('id');
  const result = await adminDeleteUser(userId);
  return c.json({ deleted: result });
});

/**
 * DELETE /admin/users
 * Bulk-delete multiple users. Body: { ids: string[] }. Owner-only.
 * Maximum 200 IDs per request.
 */
adminRoutes.delete('/users', requireRole('owner'), async (c) => {
  const body = await c.req.json();
  const { ids } = z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
  }).parse(body);
  const result = await adminBulkDeleteUsers(ids);
  return c.json(result);
});
