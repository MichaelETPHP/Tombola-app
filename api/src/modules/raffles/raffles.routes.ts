import { Hono } from 'hono';
import { createRaffleSchema, listRafflesSchema } from './raffles.schema.js';
import { createRaffle, getRaffle, listRaffles } from './raffles.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/require-role.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const rafflesRoutes = new Hono<AppEnv>();

/**
 * GET /raffles
 * List all raffles (public, no auth required for browsing).
 */
rafflesRoutes.get('/', async (c) => {
  const query = c.req.query();
  const input = listRafflesSchema.parse(query);
  const raffles = await listRaffles(input);
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

adminRafflesRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const data = createRaffleSchema.parse(body);
  const admin = c.get('admin');
  const raffle = await createRaffle(data, admin.id);
  return c.json({ raffle }, 201);
});
