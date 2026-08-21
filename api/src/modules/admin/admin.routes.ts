import { Hono } from 'hono';
import { listUsersSchema, suspendUserSchema } from './admin.schema.js';
import { getDashboardStats, adminListUsers, adminSuspendUser } from './admin.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const adminRoutes = new Hono<AppEnv>();

// All admin routes require auth + admin role
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
