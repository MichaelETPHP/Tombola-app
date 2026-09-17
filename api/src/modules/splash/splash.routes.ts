import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import { getSplashSlides, replaceSplashSlideImage } from './splash.service.js';
import type { AppEnv } from '../../types/hono.js';

const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024; // raw upload cap — compression happens after

function parseSlot(raw: string): number {
  const slot = Number(raw);
  if (slot !== 1 && slot !== 2) throw new AppError(404, 'Splash only has slides 1 and 2.');
  return slot;
}

/**
 * GET /splash
 * Public — the mobile app's boot carousel fetches this on launch, falling
 * back to its own bundled images if the request fails for any reason.
 */
export const splashRoutes = new Hono<AppEnv>();

splashRoutes.get('/', async (c) => {
  const slides = await getSplashSlides();
  return c.json({ slides });
});

/** Mounted under /admin/splash in the main router. */
export const adminSplashRoutes = new Hono<AppEnv>();

adminSplashRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

adminSplashRoutes.get('/', async (c) => {
  const slides = await getSplashSlides();
  return c.json({ slides });
});

/**
 * POST /admin/splash/:slot/image
 * Multipart upload replacing one slide's photo — same compress-then-store
 * pipeline as a raffle's prize photo (processSplashImage, WebP, old file
 * cleanup), just sized for a full-bleed portrait screen instead of a
 * square-ish prize thumbnail.
 */
adminSplashRoutes.post(
  '/:slot/image',
  bodyLimit({
    maxSize: MAX_IMAGE_UPLOAD_BYTES,
    onError: (c) => c.json({ error: 'Image is too large' }, 413),
  }),
  async (c) => {
    const slot = parseSlot(c.req.param('slot'));
    const admin = c.get('admin')!;

    const body = await c.req.parseBody();
    const file = body.image;
    if (!(file instanceof File)) throw new AppError(400, 'An image file is required.');

    const result = await replaceSplashSlideImage(slot, Buffer.from(await file.arrayBuffer()), admin.id);
    return c.json(result, 201);
  }
);
