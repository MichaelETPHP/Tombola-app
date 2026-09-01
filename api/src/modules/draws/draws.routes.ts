import { Hono } from 'hono';
import { executeDraw, getDrawContext } from './draws.service.js';
import { clientIp } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const drawsRoutes = new Hono<AppEnv>();

/**
 * GET /draws/:token
 * Trigger link landing — executes the draw when clicked.
 * This is a public endpoint (no auth) because it's accessed via SMS link.
 */
drawsRoutes.get('/:token', async (c) => {
  const draw = await getDrawContext(c.req.param('token'));
  return c.json({ draw });
});

drawsRoutes.post('/:token/spin', async (c) => {
  const token = c.req.param('token');
  const result = await executeDraw(token, clientIp(c));
  return c.json(result);
});
