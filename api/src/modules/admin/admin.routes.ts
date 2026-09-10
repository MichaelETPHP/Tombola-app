import { Hono } from 'hono';
import { ticketInventory, recordReviewedRefund } from '../tickets/ticket-admin.js';
import { findPaymentById } from '../../db/queries/payments.queries.js';
import { verifyAndReconcileChapaPayment } from '../payments/payments.service.js';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { env } from '../../config/env.js';
import { adminOrigin } from '../../middleware/admin-origin.middleware.js';
import { refreshAccessToken, logout } from '../auth/auth.service.js';
import { verifyRefreshToken } from '../../lib/jwt.js';
import { z } from 'zod';
import {
  listUsersSchema,
  suspendUserSchema,
  bulkSmsSchema,
  adminLoginSchema,
  updateOwnProfileSchema,
  createAdminSchema,
  updateAdminSchema,
  listAuditLogSchema,
} from './admin.schema.js';
import {
  getDashboardStats,
  getProfitOverview,
  adminListUsers,
  adminSuspendUser,
  adminLogin,
  getIntegrationsStatus,
  adminDeleteUser,
  adminBulkDeleteUsers,
  adminBulkSendSms,
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

adminRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, private');
  await next();
});

const adminCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'None' as const : 'Lax' as const,
  path: '/admin/auth',
};

/**
 * POST /admin/auth/login
 * Admin login endpoint (public, unauthenticated).
 */
adminRoutes.post('/auth/login', adminOrigin, rateLimit({ max: 5, windowSeconds: 900 }), async (c) => {
  const body = await c.req.json();
  const input = adminLoginSchema.parse(body);
  const result = await adminLogin(input.phone, input.password);

  setCookie(c, 'admin_refresh_token', result.refreshToken, {
    ...adminCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json({
    accessToken: result.accessToken,
    admin: result.admin,
  });
});

adminRoutes.post('/auth/refresh', adminOrigin, rateLimit({ max: 30, windowSeconds: 300 }), async (c) => {
  const token = getCookie(c, 'admin_refresh_token');
  const payload = token ? await verifyRefreshToken(token).catch(() => null) : null;
  if (!payload || !['owner', 'moderator'].includes(payload.role)) {
    return c.json({ error: 'Please sign in again.', code: 'AUTH_REFRESH_REQUIRED' }, 401);
  }
  return c.json(await refreshAccessToken(token!));
});

adminRoutes.post('/auth/logout', adminOrigin, rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  await logout(getCookie(c, 'admin_refresh_token'));
  deleteCookie(c, 'admin_refresh_token', adminCookieOptions);
  return c.json({ message: 'Signed out of admin sessions.' });
});

// All subsequent admin routes require auth + admin role
adminRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

adminRoutes.get('/raffles/:id/ticket-inventory', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'));
  const start = z.coerce.number().int().min(1).max(2147483547).default(1).parse(c.req.query('start'));
  return c.json(await ticketInventory(id, start));
});
adminRoutes.post('/payments/:id/reconcile', requireRole('owner'), rateLimit({ max: 15, windowSeconds: 60 }), async (c) => {
  const payment = await findPaymentById(z.string().uuid().parse(c.req.param('id')));
  if (!payment?.gatewayRef || payment.gateway !== 'chapa') return c.json({ error: 'No supported gateway transaction found' }, 409);
  await verifyAndReconcileChapaPayment(payment.gatewayRef);
  return c.json({ message: 'Gateway status checked' });
});
adminRoutes.post('/payments/:id/record-refund', requireRole('owner'), rateLimit({ max: 10, windowSeconds: 60 }), async (c) => {
  const input = z.object({ reference: z.string().trim().min(5).max(200), refundCompleted: z.literal(true) }).parse(await c.req.json());
  await recordReviewedRefund(z.string().uuid().parse(c.req.param('id')), c.get('admin')!.id, input.reference);
  return c.json({ message: 'External refund recorded' });
});

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
 * GET /admin/profits
 * Completed-payment revenue and committed prize cost by raffle.
 * Owner-only because this is commercially sensitive information.
 */
adminRoutes.get('/profits', requireRole('owner'), async (c) => {
  return c.json(await getProfitOverview());
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
  const input = listUsersSchema.parse(query);
  return c.json(await adminListUsers(input));
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

/**
 * POST /admin/users/sms
 * Send one message to a set of users' phone numbers in a single gateway
 * request. Body: { userIds: string[], message: string }. Maximum 200 IDs
 * per request (same cap as bulk-delete).
 */
adminRoutes.post('/users/sms', async (c) => {
  const body = await c.req.json();
  const input = bulkSmsSchema.parse(body);
  const result = await adminBulkSendSms(input);
  return c.json(result);
});
