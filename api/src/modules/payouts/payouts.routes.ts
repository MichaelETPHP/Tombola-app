import { Hono } from 'hono';
import { submitClaimSchema, updatePayoutStatusSchema } from './payouts.schema.js';
import { submitClaim, updatePayoutStatus, listPayouts, listMyPayouts } from './payouts.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const payoutsRoutes = new Hono<AppEnv>();

payoutsRoutes.use('*', authMiddleware);

/**
 * GET /payouts/mine
 * List the authenticated user's own win/claim history.
 */
payoutsRoutes.get('/mine', async (c) => {
  const user = c.get('user');
  const query = c.req.query();
  const limit = parseInt(query.limit || '20', 10);
  const offset = parseInt(query.offset || '0', 10);
  const payouts = await listMyPayouts(user.id, limit, offset);
  return c.json({ payouts });
});

/**
 * POST /payouts/:id/claim
 * Submit a prize claim with delivery info.
 * ID document upload is handled separately via multipart form.
 */
payoutsRoutes.post('/:id/claim', async (c) => {
  const payoutId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();
  const data = submitClaimSchema.parse(body);

  // For now, ID document URL is passed in body (will be replaced with upload flow)
  const idDocumentUrl = (body as Record<string, unknown>).idDocumentUrl as string || '';

  const result = await submitClaim(payoutId, user.id, data, idDocumentUrl);
  return c.json({ payout: result });
});

/**
 * Admin payout routes — mounted under /admin/payouts
 */
export const adminPayoutsRoutes = new Hono<AppEnv>();

adminPayoutsRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

/**
 * GET /admin/payouts
 * List all payouts with optional status filter.
 */
adminPayoutsRoutes.get('/', async (c) => {
  const query = c.req.query();
  const payouts = await listPayouts({
    status: query.status,
    limit: parseInt(query.limit || '20', 10),
    offset: parseInt(query.offset || '0', 10),
  });
  return c.json({ payouts });
});

/**
 * PATCH /admin/payouts/:id
 * Update payout status (verify, fulfill, reject).
 */
adminPayoutsRoutes.patch('/:id', async (c) => {
  const payoutId = c.req.param('id');
  const admin = c.get('admin');
  const body = await c.req.json();
  const data = updatePayoutStatusSchema.parse(body);
  const result = await updatePayoutStatus(payoutId, admin.id, data);
  return c.json({ payout: result });
});
