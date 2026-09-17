import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  submitClaimSchema,
  updatePayoutStatusSchema,
  createDeliveryMethodSchema,
  updateDeliveryMethodSchema,
} from './payouts.schema.js';
import {
  submitClaim,
  updatePayoutStatus,
  listPayouts,
  listMyPayouts,
  getPayoutById,
  getMyPayoutById,
  getActiveDeliveryMethods,
  getAllDeliveryMethods,
  addDeliveryMethod,
  editDeliveryMethod,
  uploadClaimIdDocument,
  resolveIdDocumentPath,
} from './payouts.service.js';
import { findPayoutById } from '../../db/queries/payouts.queries.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { AppEnv } from '../../types/hono.js';

const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024; // raw upload cap — compression happens after

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
 * GET /payouts/delivery-methods
 * Active prize-delivery options the claim screen offers a winner. Mounted
 * before /:id so it isn't swallowed as a payout id.
 */
payoutsRoutes.get('/delivery-methods', async (c) => {
  const methods = await getActiveDeliveryMethods();
  return c.json({ methods });
});

/**
 * GET /payouts/:id
 * One of the authenticated user's own payouts, with raffle/prize context
 * — what the claim screen loads first.
 */
payoutsRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const payout = await getMyPayoutById(c.req.param('id'), user.id);
  return c.json({ payout });
});

/**
 * POST /payouts/:id/id-document
 * Multipart upload of the winner's ID photo — a separate step from
 * submitting the rest of the claim (see payouts.service.ts) so an
 * interrupted claim never has to redo the one annoying part. Same
 * compress-then-store pipeline as every other image upload in this app,
 * just routed through a category the public /uploads route refuses to
 * ever serve (this is sensitive personal data, not a public asset).
 */
payoutsRoutes.post(
  '/:id/id-document',
  bodyLimit({
    maxSize: MAX_IMAGE_UPLOAD_BYTES,
    onError: (c) => c.json({ error: 'Image is too large' }, 413),
  }),
  async (c) => {
    const payoutId = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.parseBody();
    const file = body.image;
    if (!(file instanceof File)) throw new AppError(400, 'An image file is required.');

    const idDocumentUrl = await uploadClaimIdDocument(payoutId, user.id, Buffer.from(await file.arrayBuffer()));
    return c.json({ idDocumentUrl }, 201);
  }
);

/**
 * GET /payouts/:id/id-document
 * Streams the winner's own uploaded ID photo back — the only read path
 * for this file besides the admin route below.
 */
payoutsRoutes.get('/:id/id-document', async (c) => {
  const user = c.get('user');
  const payout = await findPayoutById(c.req.param('id'));
  if (!payout || payout.winnerUserId !== user.id) throw new AppError(404, 'Payout not found');

  const path = resolveIdDocumentPath(payout.idDocumentUrl);
  if (!path) return c.notFound();
  const file = Bun.file(path);
  if (!(await file.exists())) return c.notFound();
  return new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
});

/**
 * POST /payouts/:id/claim
 * Submit a prize claim with delivery info. The ID document must already
 * be uploaded via POST /:id/id-document above.
 */
payoutsRoutes.post('/:id/claim', async (c) => {
  const payoutId = c.req.param('id');
  const user = c.get('user');
  const data = submitClaimSchema.parse(await c.req.json());
  const result = await submitClaim(payoutId, user.id, data);
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
 * GET/POST/PATCH /admin/payouts/delivery-methods
 * Manage the prize-delivery options winners can choose from. Mounted
 * before /:id so 'delivery-methods' is never read as a payout id.
 */
adminPayoutsRoutes.get('/delivery-methods', async (c) => {
  const methods = await getAllDeliveryMethods();
  return c.json({ methods });
});

adminPayoutsRoutes.post('/delivery-methods', async (c) => {
  const data = createDeliveryMethodSchema.parse(await c.req.json());
  const method = await addDeliveryMethod(data);
  return c.json({ method }, 201);
});

adminPayoutsRoutes.patch('/delivery-methods/:methodId', async (c) => {
  const data = updateDeliveryMethodSchema.parse(await c.req.json());
  const method = await editDeliveryMethod(c.req.param('methodId'), data);
  return c.json({ method });
});

/**
 * GET /admin/payouts/:id
 * A single payout with raffle/winner/prize context joined in.
 */
adminPayoutsRoutes.get('/:id', async (c) => {
  const payout = await getPayoutById(c.req.param('id'));
  return c.json({ payout });
});

/**
 * GET /admin/payouts/:id/id-document
 * Streams a winner's submitted ID photo back for review.
 */
adminPayoutsRoutes.get('/:id/id-document', async (c) => {
  const payout = await findPayoutById(c.req.param('id'));
  if (!payout) throw new AppError(404, 'Payout not found');

  const path = resolveIdDocumentPath(payout.idDocumentUrl);
  if (!path) return c.notFound();
  const file = Bun.file(path);
  if (!(await file.exists())) return c.notFound();
  return new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
});

/**
 * PATCH /admin/payouts/:id
 * Update payout status (verify, fulfill, reject).
 */
adminPayoutsRoutes.patch('/:id', async (c) => {
  const payoutId = c.req.param('id');
  const data = updatePayoutStatusSchema.parse(await c.req.json());
  const result = await updatePayoutStatus(payoutId, c.get('admin').id, data);
  return c.json({ payout: result });
});
