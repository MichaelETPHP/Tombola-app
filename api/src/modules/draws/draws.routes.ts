import { Hono } from 'hono';
import { executeDraw } from './draws.service.js';
import type { AppEnv } from '../../types/hono.js';

export const drawsRoutes = new Hono<AppEnv>();

/**
 * GET /draws/:token
 * Trigger link landing — executes the draw when clicked.
 * This is a public endpoint (no auth) because it's accessed via SMS link.
 */
drawsRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');
  const result = await executeDraw(token);
  return c.json(result);
});
