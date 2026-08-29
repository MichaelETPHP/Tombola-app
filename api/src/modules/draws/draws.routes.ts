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
  const clickedIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null;
  const result = await executeDraw(token, clickedIp);
  return c.json(result);
});
