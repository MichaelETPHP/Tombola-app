import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createRaffleSchema, generateDrawTriggerSchema, listRafflesSchema, updateRaffleSchema, updateRaffleStatusSchema, updateRaffleDeadlineSchema } from './raffles.schema.js';
import { createRaffle, getRaffle, listRaffles, updateRaffle, changeRaffleStatus, changeRaffleDeadline } from './raffles.service.js';
import { findRafflePrize, updateRafflePrizeImage } from '../../db/queries/raffles.queries.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { processPrizeImage } from '../../lib/image.js';
import { deleteUploadedImage, saveUploadedImage, uploadedImagePathFromPublicUrl } from '../../lib/uploads.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { AppEnv } from '../../types/hono.js';
import { generateTriggerLink, getRaffleEngine } from '../draws/draws.service.js';

const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024; // raw upload cap, well above any real photo — compression happens after

export const rafflesRoutes = new Hono<AppEnv>();

/**
 * GET /raffles
 * List all raffles (public, no auth required for browsing).
 */
rafflesRoutes.get('/', async (c) => {
  const query = c.req.query();
  const input = listRafflesSchema.parse(query);
  if (input.status === 'draft' || input.status === 'cancelled') {
    return c.json({ raffles: [] });
  }
  const raffles = await listRaffles({ ...input, status: input.status ?? 'open' });
  return c.json({ raffles });
});

/**
 * GET /raffles/:id
 * Get a single raffle by ID (public).
 */
rafflesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const raffle = await getRaffle(id);
  return c.json({ raffle });
});

/**
 * POST /admin/raffles
 * Create a new raffle (admin only).
 * Note: This is mounted under /admin in the main router, so full path is POST /admin/raffles.
 */
export const adminRafflesRoutes = new Hono<AppEnv>();

adminRafflesRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

adminRafflesRoutes.get('/', async (c) => {
  const input = listRafflesSchema.parse(c.req.query());
  const raffles = await listRaffles(input);
  return c.json({ raffles });
});

adminRafflesRoutes.get('/:id', async (c) => {
  const raffle = await getRaffle(c.req.param('id'));
  return c.json({ raffle });
});

adminRafflesRoutes.get('/:id/engine', async (c) => {
  return c.json({ engine: await getRaffleEngine(c.req.param('id')) });
});

adminRafflesRoutes.post('/:id/draw-trigger', requireRole('owner'), async (c) => {
  const data = generateDrawTriggerSchema.parse(await c.req.json().catch(() => ({})));
  const trigger = await generateTriggerLink(c.req.param('id'), c.get('admin').id, data.reason);
  return c.json({ trigger }, 201);
});

adminRafflesRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const data = createRaffleSchema.parse(body);
  const admin = c.get('admin');
  const raffle = await createRaffle(data, admin.id);
  return c.json({ raffle }, 201);
});

/** Update editable raffle content and commercial settings. */
adminRafflesRoutes.patch('/:id', async (c) => {
  const data = updateRaffleSchema.parse(await c.req.json());
  const raffle = await updateRaffle(c.req.param('id'), data);
  return c.json({ raffle });
});

/**
 * POST /admin/raffles/:id/image
 * Multipart upload of the prize photo — compressed and resized via sharp
 * (processPrizeImage: max 800x800, WebP, quality 85) before it's ever
 * written to disk, so the app never has to load a multi-megabyte photo
 * straight from someone's camera. Attached to an existing raffle rather
 * than at creation time — there's no id to attach to before the raffle
 * itself exists.
 */
adminRafflesRoutes.post(
  '/:id/image',
  bodyLimit({
    maxSize: MAX_IMAGE_UPLOAD_BYTES,
    onError: (c) => c.json({ error: c.get('t')('raffle.imageTooLarge'), code: 'RAFFLE_IMAGETOOLARGE' }, 413),
  }),
  async (c) => {
    const raffleId = c.req.param('id');
    const current = await getRaffle(raffleId);
    const body = await c.req.parseBody();
    const file = body.image;
    if (!(file instanceof File)) throw new AppError(400, 'raffle.imageRequired');

    let processed;
    try {
      processed = await processPrizeImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new AppError(400, 'raffle.invalidImage');
    }

    let stored;
    try {
      stored = await saveUploadedImage(processed, 'raffles');
    } catch {
      throw new AppError(503, 'Raffle image storage is unavailable or not configured');
    }

    try {
      const raffle = await updateRaffle(raffleId, { prizeImageUrl: stored.publicUrl });
      const previousPath = uploadedImagePathFromPublicUrl(current.prizeImageUrl);
      if (previousPath) deleteUploadedImage(previousPath).catch(() => undefined);
      return c.json({
        raffle,
        image: { format: processed.format, width: processed.width, height: processed.height, bytes: processed.size },
      }, 201);
    } catch (error) {
      await deleteUploadedImage(stored.path).catch(() => undefined);
      throw error;
    }
  }
);

/**
 * POST /admin/raffles/:id/prizes/:prizeId/image
 * Same pipeline as the raffle cover photo above (processPrizeImage, WebP,
 * old file cleanup), but for one specific prize tier — a raffle can have
 * up to 4 photos total: the main cover plus one per prize (1st/2nd/3rd).
 */
adminRafflesRoutes.post(
  '/:id/prizes/:prizeId/image',
  bodyLimit({
    maxSize: MAX_IMAGE_UPLOAD_BYTES,
    onError: (c) => c.json({ error: c.get('t')('raffle.imageTooLarge'), code: 'RAFFLE_IMAGETOOLARGE' }, 413),
  }),
  async (c) => {
    const raffleId = c.req.param('id');
    const prizeId = c.req.param('prizeId');
    const currentPrize = await findRafflePrize(raffleId, prizeId);
    if (!currentPrize) throw new AppError(404, 'Prize tier not found');

    const body = await c.req.parseBody();
    const file = body.image;
    if (!(file instanceof File)) throw new AppError(400, 'raffle.imageRequired');

    let processed;
    try {
      processed = await processPrizeImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new AppError(400, 'raffle.invalidImage');
    }

    let stored;
    try {
      stored = await saveUploadedImage(processed, 'raffles');
    } catch {
      throw new AppError(503, 'Raffle image storage is unavailable or not configured');
    }

    try {
      await updateRafflePrizeImage(prizeId, stored.publicUrl);
      const raffle = await getRaffle(raffleId);
      const previousPath = uploadedImagePathFromPublicUrl(currentPrize.imageUrl);
      if (previousPath) deleteUploadedImage(previousPath).catch(() => undefined);
      return c.json({
        raffle,
        image: { format: processed.format, width: processed.width, height: processed.height, bytes: processed.size },
      }, 201);
    } catch (error) {
      await deleteUploadedImage(stored.path).catch(() => undefined);
      throw error;
    }
  }
);

/** Change lifecycle state. Restricted to the Platform Owner. */
adminRafflesRoutes.patch('/:id/status', requireRole('owner'), async (c) => {
  const data = updateRaffleStatusSchema.parse(await c.req.json());
  const raffle = await changeRaffleStatus(c.req.param('id'), data);
  return c.json({ raffle, message: c.get('t')('raffle.updated') });
});

/** Extend an active raffle deadline and preserve the reason in extension history. */
adminRafflesRoutes.patch('/:id/deadline', requireRole('owner'), async (c) => {
  const data = updateRaffleDeadlineSchema.parse(await c.req.json());
  const raffle = await changeRaffleDeadline(c.req.param('id'), data.deadlineAt, data.reason, c.get('admin').id);
  return c.json({ raffle, message: c.get('t')('raffle.updated') });
});
