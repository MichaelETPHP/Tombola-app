import { Hono } from 'hono';
import { z } from 'zod';
import { availabilitySchema } from './selection.js';
import { getTicketAvailability, suggestTicketNumbers } from '../../db/queries/ticket-availability.queries.js';
import { purchaseTicketsSchema } from './tickets.schema.js';
import { purchaseTickets, getUserTickets } from './tickets.service.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';

// Mounted at /raffles in index.ts — purchasing is scoped to a specific raffle.
export const ticketsRoutes = new Hono<AppEnv>();

ticketsRoutes.use('*', authMiddleware);
ticketsRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store, private'); await next(); });

ticketsRoutes.get('/:id/ticket-availability', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'));
  const query = availabilitySchema.parse(c.req.query());
  return c.json(await getTicketAvailability(id, c.get('user').id, query.start, query.limit));
});

ticketsRoutes.post('/:id/ticket-suggestions', rateLimit({ max: 20, windowSeconds: 60 }), async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'));
  const input = z.object({ count: z.number().int().min(1).max(5), exclude: z.array(z.number().int().positive()).max(5).default([]) }).parse(await c.req.json());
  return c.json({ numbers: await suggestTicketNumbers(id, input.count, input.exclude) });
});

/**
 * POST /raffles/:id/tickets
 * Purchase tickets for a raffle.
 */
ticketsRoutes.post('/:id/tickets', rateLimit({ max: 10, windowSeconds: 60 }), async (c) => {
  const raffleId = z.string().uuid().parse(c.req.param('id'));
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
