import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';

/** Cookie-authenticated admin endpoints require an explicitly trusted browser. */
export const adminOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('Origin');
  const trustedOrigins = [...env.CORS_ORIGINS.map((value) => value.trim()), new URL(env.API_BASE_URL).origin];
  if (!origin || origin === 'null' || !trustedOrigins.includes(origin)) {
    return c.json({ error: 'Open the admin dashboard from its configured address and try again.', code: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  await next();
};
