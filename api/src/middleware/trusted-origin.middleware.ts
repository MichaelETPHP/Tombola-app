import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';

/** Cookie endpoints must reject cross-site form requests before changing sessions. */
export const trustedOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('Origin');
  const allowed = [...env.CORS_ORIGINS, new URL(env.API_BASE_URL).origin];
  if (!origin || origin === 'null' || !allowed.includes(origin)) {
    return c.json({ error: 'Request origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403);
  }
  await next();
};
