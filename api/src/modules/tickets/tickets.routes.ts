import { Hono } from 'hono';
import { purchaseTicketsSchema } from './tickets.schema.js';
import { purchaseTickets, getUserTickets } from './tickets.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const ticketsRoutes = new Hono<AppEnv>();

ticketsRoutes.use('*', authMiddleware);

/**
 * POST /raffles/:id/tickets
 * Purchase tickets for a raffle.
 */
ticketsRoutes.post('/:id/tickets', async (c) => {
  const raffleId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json();
  const input = purchaseTicketsSchema.parse(body);

  const result = await purchaseTickets(raffleId, user.id, user.phone, input);
  return c.json(result, 201);
});

/**
 * GET /tickets
 * Get all tickets for the authenticated user.
 */
ticketsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tickets = await getUserTickets(user.id);
  return c.json({ tickets });
});
