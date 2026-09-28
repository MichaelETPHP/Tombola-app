import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import { getAdminTranslations, getPublicTranslations, updateTranslation } from './i18n.service.js';
import { upsertI18nStringSchema } from './i18n.schema.js';
import type { AppEnv } from '../../types/hono.js';

/**
 * GET /translations/:locale
 * Public — the mobile app fetches this at boot and merges it over its own
 * bundled en.json/am.json via svelte-i18n's addMessages(), falling back to
 * just the bundled dictionary if this request fails for any reason (see
 * language.store.ts). Returns a flat {key: value} map, e.g.
 * {"numbers.continue": "Continue"}.
 */
export const i18nRoutes = new Hono<AppEnv>();

i18nRoutes.get('/:locale', async (c) => {
  // An admin can edit a string at any moment — this must never be cached
  // by a proxy/CDN sitting in front of the API, same reasoning as /splash.
  c.header('Cache-Control', 'no-store');
  const map = await getPublicTranslations(c.req.param('locale'));
  return c.json(map);
});

/** Mounted under /admin/translations in the main router. */
export const adminI18nRoutes = new Hono<AppEnv>();

adminI18nRoutes.use('*', authMiddleware, requireRole('owner', 'moderator'));

adminI18nRoutes.get('/:locale', async (c) => {
  const strings = await getAdminTranslations(c.req.param('locale'));
  return c.json({ strings });
});

/**
 * PATCH /admin/translations/:locale
 * Body: {key, value} — upserts one string. One key per request (not a bulk
 * endpoint) so the admin page's debounced save-as-you-type never risks one
 * slow field's request clobbering another's with a stale bulk payload.
 */
adminI18nRoutes.patch('/:locale', async (c) => {
  const admin = c.get('admin')!;
  const data = upsertI18nStringSchema.parse(await c.req.json());
  const row = await updateTranslation(c.req.param('locale'), data.key, data.value, admin.id);
  return c.json(row);
});
