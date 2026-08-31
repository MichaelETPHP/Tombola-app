import { Hono } from 'hono';
import { resolveUploadPath } from '../../lib/uploads.js';
import type { AppEnv } from '../../types/hono.js';

export const uploadsRoutes = new Hono<AppEnv>();

/**
 * GET /uploads/:category/:filename
 * Serves a previously uploaded, sharp-compressed image (raffle prize
 * photos today, more categories later). No auth — same as any other
 * public raffle asset. Filenames are random and never reused, so the
 * response is safe to cache forever rather than re-validated every time.
 */
uploadsRoutes.get('/:category/:filename', async (c) => {
  const path = resolveUploadPath(c.req.param('category'), c.req.param('filename'));
  if (!path) return c.notFound();

  const file = Bun.file(path);
  if (!(await file.exists())) return c.notFound();

  return new Response(file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
