import { Hono } from 'hono';
import { createRaffleSchema, listRafflesSchema, updateRaffleSchema, updateRaffleStatusSchema, updateRaffleDeadlineSchema } from './raffles.schema.js';
import { createRaffle, getRaffle, listRaffles, updateRaffle, changeRaffleStatus, changeRaffleDeadline } from './raffles.service.js';
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

/** Change lifecycle state. Restricted to the Platform Owner. */
adminRafflesRoutes.patch('/:id/status', requireRole('owner'), async (c) => {
  const data = updateRaffleStatusSchema.parse(await c.req.json());
  const raffle = await changeRaffleStatus(c.req.param('id'), data);
  return c.json({ raffle, message: c.get('t')('raffle.updated') });
});

/** Extend an active raffle deadline and preserve the reason in extension history. */
adminRafflesRoutes.patch('/:id/deadline', requireRole('owner'), async (c) => {
  const data = updateRaffleDeadlineSchema.parse(await c.req.json());
  const raffle = await changeRaffleDeadline(c.req.param('id'), data.deadlineAt, data.reason);
  return c.json({ raffle, message: c.get('t')('raffle.updated') });
});
