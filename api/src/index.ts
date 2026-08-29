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
import { startRaffleDeadlineCheck } from './jobs/raffle-deadline-check.job.js';
import { startTriggerExpiryCheck } from './jobs/trigger-expiry-check.job.js';
import { closeDb } from './db/client.js';
import { logger } from './lib/logger.js';
import { languageMiddleware } from './lib/i18n.js';
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

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: '1.0.0',
    requestId: c.get('requestId'),
  });
});

app.get('/', (c) => c.json({
  name: 'Tombola API',
  version: '1.0.0',
  status: 'ready',
  languages: ['en', 'am'],
}));

// ─── Public Routes ────────────────────────────────────────────────

app.route('/auth', authRoutes);
app.route('/raffles', rafflesRoutes);
app.route('/draws', drawsRoutes);
app.route('/payments', paymentsRoutes);

// ─── Authenticated User Routes ────────────────────────────────────

app.route('/users', usersRoutes);
app.route('/raffles', ticketsRoutes);  // POST /raffles/:id/tickets
app.route('/tickets', myTicketsRoutes);  // GET /tickets — separate mount, see tickets.routes.ts
app.route('/payouts', payoutsRoutes);

// ─── Admin Routes ─────────────────────────────────────────────────

app.route('/admin', adminRoutes);
app.route('/admin/raffles', adminRafflesRoutes);
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
  fetch: app.fetch,
};
