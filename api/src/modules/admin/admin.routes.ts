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
  sendUserSmsSchema,
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
  adminGetUser,
  adminSuspendUser,
  adminLogin,
  getIntegrationsStatus,
  getIntegrationLogsPage,
  adminDeleteUser,
  adminBulkDeleteUsers,
  adminBulkSendSms,
  getUserTickets,
  getUserPayouts,
  getUserSmsLogs,
  getUserLogins,
  adminSendSmsToUser,
  getAdminProfile,
  updateOwnAdminProfile,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getAuditLog,
} from './admin.service.js';
import { getSmsStats, getSmsLogsPage } from './sms-admin.service.js';
import { listClientCrashLogs, getClientCrashStats, type ClientCrashPlatform } from '../../lib/client-crash-log.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
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
 * live, whether credentials look configured, and a real-time reachability
 * probe for otp/chapa. Never returns secret values. Owner-only: it's
 * infrastructure/security-adjacent information moderators don't need.
 */
adminRoutes.get('/integrations', requireRole('owner'), async (c) => {
  return c.json({ integrations: await getIntegrationsStatus() });
});

/**
 * GET /admin/integrations/logs
 * Recent SMS/Chapa send attempts, success and failure, with error detail —
 * backs the log viewer under the same page. Keyset-paginated on
 * createdAt via ?before=<ISO timestamp>; ?integration= and ?status=
 * filter. Owner-only, same reasoning as /integrations above.
 */
adminRoutes.get('/integrations/logs', requireRole('owner'), async (c) => {
  const integration = c.req.query('integration');
  const status = c.req.query('status');
  const before = c.req.query('before');
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 50;

  if (integration && !['sms', 'chapa', 'telegram'].includes(integration)) {
    throw new AppError(400, 'Invalid integration filter');
  }
  if (status && !['success', 'error'].includes(status)) {
    throw new AppError(400, 'Invalid status filter');
  }

  const page = await getIntegrationLogsPage({
    integration: integration as 'sms' | 'chapa' | 'telegram' | undefined,
    status: status as 'success' | 'error' | undefined,
    limit,
    before,
  });
  return c.json(page);
});

/**
 * GET /admin/sms/stats
 * Header-card counts for the dedicated SMS page: total sent, delivered,
 * failed, and sent in the last 24h. Owner-only, same reasoning as
 * /integrations above.
 */
adminRoutes.get('/sms/stats', requireRole('owner'), async (c) => {
  return c.json(await getSmsStats());
});

/**
 * GET /admin/sms/logs
 * Every SMS send attempt (OTP, ticket confirmations, draw invitations,
 * admin broadcasts), one row per recipient, with the message content,
 * delivery status, and the receiver's registered name where known.
 * Keyset-paginated via ?before=<ISO timestamp>; ?status= filters.
 */
adminRoutes.get('/sms/logs', requireRole('owner'), async (c) => {
  const status = c.req.query('status');
  const before = c.req.query('before');
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 50;

  if (status && !['success', 'error'].includes(status)) {
    throw new AppError(400, 'Invalid status filter');
  }

  const page = await getSmsLogsPage({ status: status as 'success' | 'error' | undefined, limit, before });
  return c.json(page);
});

/**
 * GET /admin/crashes/stats
 * Header-card counts for the crash-reports page. Owner-only, same
 * reasoning as /integrations and /sms/stats above.
 */
adminRoutes.get('/crashes/stats', requireRole('owner'), async (c) => {
  return c.json(await getClientCrashStats());
});

/**
 * GET /admin/crashes
 * Every crash the mobile app's root error boundary has caught — message,
 * stack trace, URL, platform (Telegram/native/browser), and whether the
 * one-shot self-heal already fired for it. Keyset-paginated via
 * ?before=<ISO timestamp>; ?platform= filters.
 */
adminRoutes.get('/crashes', requireRole('owner'), async (c) => {
  const platform = c.req.query('platform');
  const before = c.req.query('before');
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 50;

  if (platform && !['telegram', 'native', 'browser'].includes(platform)) {
    throw new AppError(400, 'Invalid platform filter');
  }

  const page = await listClientCrashLogs({ platform: platform as ClientCrashPlatform | undefined, limit, before });
  return c.json(page);
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

/**
 * GET /admin/users/:id
 * Full "Customer Profile" for one user — profile fields plus at-a-glance
 * stats (tickets bought, total spent, SMS sent, prizes won, last login).
 */
adminRoutes.get('/users/:id', async (c) => {
  const user = await adminGetUser(z.string().uuid().parse(c.req.param('id')));
  return c.json({ user });
});

/**
 * GET /admin/users/:id/tickets
 * This user's tickets across every raffle they've bought into.
 */
adminRoutes.get('/users/:id/tickets', async (c) => {
  const tickets = await getUserTickets(z.string().uuid().parse(c.req.param('id')));
  return c.json({ tickets });
});

/**
 * GET /admin/users/:id/payouts
 * This user's win/payout record, raffle and prize context included.
 */
adminRoutes.get('/users/:id/payouts', async (c) => {
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 25;
  const offsetParam = Number(c.req.query('offset'));
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;
  const payouts = await getUserPayouts(z.string().uuid().parse(c.req.param('id')), limit, offset);
  return c.json({ payouts });
});

/**
 * GET /admin/users/:id/sms
 * Every SMS this user has ever received — the same shape as the general
 * SMS log, scoped to their phone. Keyset-paginated via ?before=.
 */
adminRoutes.get('/users/:id/sms', async (c) => {
  const before = c.req.query('before');
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 25;
  const page = await getUserSmsLogs(z.string().uuid().parse(c.req.param('id')), { limit, before });
  return c.json(page);
});

/**
 * GET /admin/users/:id/logins
 * Every recorded login for this user — empty for logins before this
 * feature shipped, see lib/login-events.ts. Keyset-paginated via ?before=.
 */
adminRoutes.get('/users/:id/logins', async (c) => {
  const before = c.req.query('before');
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 25;
  const page = await getUserLogins(z.string().uuid().parse(c.req.param('id')), limit, before);
  return c.json(page);
});

/**
 * POST /admin/users/:id/sms
 * Send one message straight to this user — distinct from the bulk-SMS
 * endpoint above, tagged with its own event so it's visually distinguishable
 * in the SMS log viewer as a targeted send rather than a broadcast.
 */
adminRoutes.post('/users/:id/sms', async (c) => {
  const input = sendUserSmsSchema.parse(await c.req.json());
  const result = await adminSendSmsToUser(z.string().uuid().parse(c.req.param('id')), input);
  return c.json(result);
});
