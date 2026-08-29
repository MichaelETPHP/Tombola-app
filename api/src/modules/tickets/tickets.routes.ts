import { Hono } from 'hono';
import { purchaseTicketsSchema } from './tickets.schema.js';
import { purchaseTickets, getUserTickets } from './tickets.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import type { AppEnv } from '../../types/hono.js';

// Mounted at /raffles in index.ts — purchasing is scoped to a specific raffle.
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

// Mounted at /tickets in index.ts. Kept as a separate router from
// ticketsRoutes above — both mounted under /raffles would have made this
// GET / collide with (and be shadowed by) the public raffles-list router,
// which is also mounted at /raffles and registered first.
export const myTicketsRoutes = new Hono<AppEnv>();

myTicketsRoutes.use('*', authMiddleware);

/**
 * GET /tickets
 * Get all tickets for the authenticated user.
 */
myTicketsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tickets = await getUserTickets(user.id);
  return c.json({ tickets });
});
