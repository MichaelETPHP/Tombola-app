import { Hono } from 'hono';
import { executeDraw, getDrawContext, getRepresentativeContext, approveRepresentative } from './draws.service.js';
import { clientIp } from '../../middleware/rate-limit.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const drawsRoutes = new Hono<AppEnv>();

/**
 * GET /draws/:token
 * Trigger link landing — executes the draw when clicked.
 * This is a public endpoint (no auth) because it's accessed via SMS link.
 */
// Accept already-issued 48-character links during the rollout; every new
// SMS uses the shorter 32-character token.
const TOKEN_PATTERN = /^(?:[A-Za-z0-9_-]{32}|[A-Za-z0-9_-]{48})$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{24}$/;

drawsRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store, private, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Referrer-Policy', 'no-referrer');
  await next();
});

/**
 * GET /draws/represent/:token
 * Representative approval landing — read-only context for the /represent
 * page. Public (no auth), reached via the representative's SMS link.
 */
drawsRoutes.get('/represent/:token', rateLimit({ max: 20, windowSeconds: 60 }), async (c) => {
  const token = c.req.param('token');
  if (!TOKEN_PATTERN.test(token)) throw new AppError(404, 'Invalid representative link');
  const representative = await getRepresentativeContext(token);
  return c.json({ representative });
});

/**
 * POST /draws/represent/:token/approve
 * The representative taps Approve — no spin, no nonce, just a witness
 * signature. Public (no auth), rate limited to blunt brute-forcing a token.
 */
drawsRoutes.post('/represent/:token/approve', rateLimit({ max: 10, windowSeconds: 60 }), async (c) => {
  const token = c.req.param('token');
  if (!TOKEN_PATTERN.test(token)) throw new AppError(404, 'Invalid representative link');
  const result = await approveRepresentative(token);
  return c.json(result);
});

drawsRoutes.get('/:token', rateLimit({ max: 20, windowSeconds: 60 }), async (c) => {
  const token = c.req.param('token');
  if (!TOKEN_PATTERN.test(token)) throw new AppError(404, 'Invalid draw link');
  const draw = await getDrawContext(token);
  return c.json({ draw });
});

drawsRoutes.post('/:token/spin', rateLimit({ max: 5, windowSeconds: 60 }), async (c) => {
  const origin = c.req.header('origin');
  if (!origin || !env.CORS_ORIGINS.includes(origin)) throw new AppError(403, 'Draw request origin is not allowed');
  const token = c.req.param('token');
  if (!TOKEN_PATTERN.test(token)) throw new AppError(404, 'Invalid draw link');
  const body = await c.req.json().catch(() => ({})) as { spinNonce?: string };
  if (!body.spinNonce || !NONCE_PATTERN.test(body.spinNonce)) throw new AppError(403, 'Draw authorization expired');
  const result = await executeDraw(token, body.spinNonce, clientIp(c));
  return c.json(result);
});
