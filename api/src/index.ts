import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { rafflesRoutes, adminRafflesRoutes } from './modules/raffles/raffles.routes.js';
import { ticketsRoutes, myTicketsRoutes } from './modules/tickets/tickets.routes.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { drawsRoutes } from './modules/draws/draws.routes.js';
import { payoutsRoutes, adminPayoutsRoutes } from './modules/payouts/payouts.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { roomsRoutes, myRoomsRoutes, adminRoomsRoutes } from './modules/rooms/rooms.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { startRaffleDeadlineCheck } from './jobs/raffle-deadline-check.job.js';
import { startTriggerExpiryCheck } from './jobs/trigger-expiry-check.job.js';
import { closeDb } from './db/client.js';
import { logger } from './lib/logger.js';
import { languageMiddleware } from './lib/i18n.js';
import { runHealthChecks } from './lib/health.js';
import type { AppEnv } from './types/hono.js';

// ─── Create Hono App ─────────────────────────────────────────────

const app = new Hono<AppEnv>();

// ─── Global Middleware ────────────────────────────────────────────

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});
app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);
app.use('*', languageMiddleware);

app.onError(errorHandler);

// ─── Health Check ─────────────────────────────────────────────────

/**
 * GET /health
 * Deep health check: DB round-trip, memory usage, and config validation.
 * Returns 200 when status is 'ok', 207 when 'degraded', 503 when 'error'.
 * Runs all checks in parallel — typical latency is just the DB ping.
 */
app.get('/health', async (c) => {
  const report = await runHealthChecks();
  const httpStatus =
    report.status === 'ok'       ? 200 :
    report.status === 'degraded' ? 207 : 503;

  return c.json(
    { ...report, requestId: c.get('requestId') },
    httpStatus
  );
});

/**
 * GET /health/live
 * Liveness probe (Docker / k8s / Render health-check path).
 * Only checks that the process itself is responsive — does NOT hit the DB.
 * Always returns 200 while the process is alive.
 */
app.get('/health/live', (c) => {
  return c.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/db
 * Quick DB-only probe — useful for testing the database connection
 * without running all other checks.
 */
app.get('/health/db', async (c) => {
  const start = Date.now();
  try {
    const rows = await import('./db/client.js').then(({ sql }) =>
      sql<{ now: string; version: string }[]>`
        SELECT NOW() AS now, current_setting('server_version') AS version
      `
    );
    const latencyMs = Date.now() - start;
    return c.json({
      status: 'ok',
      latencyMs,
      serverTime: rows[0]?.now,
      postgresVersion: rows[0]?.version,
      requestId: c.get('requestId'),
    });
  } catch (err) {
    return c.json({
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'DB unreachable',
      requestId: c.get('requestId'),
    }, 503);
  }
});

app.get('/', (c) => c.json({
  name: 'Tombola API',
  version: '1.0.0',
  status: 'ready',
  languages: ['en', 'am'],
  endpoints: {
    health:     'GET /health        — full infrastructure health report',
    liveness:   'GET /health/live   — liveness probe (process up)',
    database:   'GET /health/db     — DB-only connectivity probe',
  },
}));

// ─── Public Routes ────────────────────────────────────────────────

app.route('/auth', authRoutes);
app.route('/uploads', uploadsRoutes);
app.route('/raffles', rafflesRoutes);
app.route('/draws', drawsRoutes);
app.route('/payments', paymentsRoutes);

// ─── Authenticated User Routes ────────────────────────────────────

app.route('/users', usersRoutes);
app.route('/raffles', ticketsRoutes);  // POST /raffles/:id/tickets
app.route('/tickets', myTicketsRoutes);  // GET /tickets — separate mount, see tickets.routes.ts
app.route('/raffles', roomsRoutes);  // GET/POST /raffles/:id/room/messages
app.route('/rooms', myRoomsRoutes);  // GET /rooms — every raffle room the user has access to
app.route('/payouts', payoutsRoutes);

// ─── Admin Routes ─────────────────────────────────────────────────

app.route('/admin', adminRoutes);
app.route('/admin/raffles', adminRafflesRoutes);
app.route('/admin/raffles', adminRoomsRoutes);  // GET/POST /admin/raffles/:id/room/messages
app.route('/admin/payouts', adminPayoutsRoutes);

app.notFound((c) => c.json({
  error: c.get('t')('common.notFound'),
  code: 'NOT_FOUND',
  requestId: c.get('requestId'),
}, 404));

// ─── Start Background Jobs ───────────────────────────────────────

if (env.NODE_ENV !== 'test') {
  startRaffleDeadlineCheck();
  startTriggerExpiryCheck();
}

// ─── Graceful Shutdown ────────────────────────────────────────────

const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  await closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start Server ─────────────────────────────────────────────────

logger.info(`🎰 Tombola API starting on port ${env.PORT}`);
logger.info(`   Environment: ${env.NODE_ENV}`);
logger.info(`   CORS origins: ${env.CORS_ORIGINS.join(', ')}`);

export default {
  port: env.PORT,
  hostname: '0.0.0.0',
  fetch: app.fetch,
};
