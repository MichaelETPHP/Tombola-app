import { Hono } from 'hono';
import { resolveUploadPath } from '../../lib/uploads.js';
import type { AppEnv } from '../../types/hono.js';

export const uploadsRoutes = new Hono<AppEnv>();

/**
 * GET /uploads/:category/:filename
 * Serves a previously uploaded, sharp-compressed image (raffle prize
 * photos, splash slides, ...). No auth — fine for anything meant to be
 * public marketing/display material. 'id-documents' is the one category
 * that must never be reachable here: a winner's ID photo is sensitive
 * personal data, not a public asset — see payouts.routes.ts for the
 * actual authenticated way to read one back.
 */
uploadsRoutes.get('/:category/:filename', async (c) => {
  if (c.req.param('category') === 'id-documents') return c.notFound();

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
