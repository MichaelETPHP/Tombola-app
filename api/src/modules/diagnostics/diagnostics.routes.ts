import { Hono } from 'hono';
import { clientCrashSchema } from './diagnostics.schema.js';
import { logClientCrash } from '../../lib/client-crash-log.js';
import { rateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';

export const diagnosticsRoutes = new Hono<AppEnv>();

/**
 * POST /diagnostics/client-crash
 * Reports one crash caught by the mobile app's root error boundary.
 * Deliberately public/unauthenticated — the whole point is to capture
 * crashes that happen *because* auth is broken (an expired token with a
 * failed refresh, e.g.), so requiring a valid session here would silently
 * drop exactly the reports that matter most. Rate limited generously per IP
 * since a crash loop before this session's self-heal kicks in could
 * otherwise fire repeatedly.
 */
diagnosticsRoutes.post('/client-crash', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  const body = clientCrashSchema.parse(await c.req.json());
  logClientCrash(body);
  return c.json({ ok: true }, 202);
});
