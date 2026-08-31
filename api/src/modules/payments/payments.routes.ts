import { Hono } from 'hono';
import { chapaWebhookSchema } from './payments.schema.js';
import {
  processPaymentSuccess,
  processPaymentFailure,
  getPaymentStatus,
  getMyPayments,
} from './payments.service.js';
import { verifyChapaWebhookSignature } from '../../lib/payment-gateway.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import type { AppEnv } from '../../types/hono.js';

export const paymentsRoutes = new Hono<AppEnv>();

/**
 * GET /payments/mine
 * The signed-in user's payment history, each with the ticket numbers it
 * issued — for the Profile screen. Registered before /:id below, since
 * Hono would otherwise match "mine" as an :id value.
 */
paymentsRoutes.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  const payments = await getMyPayments(user.id);
  return c.json({ payments });
});

/**
 * GET /payments/:id
 * Poll a payment's status — this is what the mobile app's return_url page
 * (where Chapa sends the user's browser after checkout) calls while
 * waiting for the webhook to actually issue the tickets.
 */
paymentsRoutes.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const payment = await getPaymentStatus(id, user.id);
  return c.json({ payment });
});

/**
 * POST /payments/webhook/chapa
 * Webhook receiver for Chapa payment gateway callbacks.
 * Verifies signature before processing. Idempotent.
 */
paymentsRoutes.post('/webhook/chapa', async (c) => {
  const rawBody = await c.req.text();

  // Verify webhook signature
  const signature = c.req.header('x-chapa-signature') || c.req.header('chapa-signature') || '';

  if (signature) {
    const isValid = await verifyChapaWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('Invalid Chapa webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }
  } else if (env.NODE_ENV === 'production' && !env.MOCK_PAYMENTS) {
    // In mock mode this call comes from the mock-checkout page's own
    // client-side JS (see mobile-app/src/routes/mock-checkout), which has
    // no real Chapa signature to send — that's expected, not an attack.
    // Enforcing a signature here anyway is exactly what was silently
    // breaking every mock payment once deployed with NODE_ENV=production.
    logger.warn('Missing Chapa webhook signature in production');
    return c.json({ error: 'Missing signature' }, 401);
  }

  // Parse and validate the payload
  const payload = chapaWebhookSchema.parse(JSON.parse(rawBody));

  if (payload.status === 'success') {
    await processPaymentSuccess(payload.tx_ref);
  } else {
    await processPaymentFailure(payload.tx_ref);
  }

  // Always return 200 to acknowledge receipt
  return c.json({ received: true }, 200);
});
