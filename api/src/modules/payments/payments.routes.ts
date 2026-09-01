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

  // Signature verification is mandatory UNLESS this is provably a mock
  // deployment (MOCK_PAYMENTS=true) that is ALSO not production — both
  // conditions, not just one. The previous check ("reject only if
  // production AND not mock") had the logic backwards: it *accepted* an
  // unsigned webhook whenever EITHER condition failed, which meant a real
  // deployment that simply forgot to set NODE_ENV=production (it defaults
  // to 'development') accepted unsigned webhooks even with MOCK_PAYMENTS
  // at its default `false`, and a production deploy that left
  // MOCK_PAYMENTS=true accepted them too. Either gap lets anyone who knows
  // their own tx_ref (returned by the real, authenticated ticket-purchase
  // endpoint) self-call this route and mint tickets for free. Requiring
  // BOTH flags to agree closes both gaps while still letting the genuine
  // local mock-checkout flow (mobile-app/src/routes/mock-checkout's own
  // unsigned client-side call, NODE_ENV=development + MOCK_PAYMENTS=true)
  // work exactly as before.
  const isMockDeployment = env.MOCK_PAYMENTS && env.NODE_ENV !== 'production';

  if (!isMockDeployment) {
    if (!signature) {
      logger.warn('Missing Chapa webhook signature');
      return c.json({ error: 'Missing signature' }, 401);
    }
    const isValid = await verifyChapaWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('Invalid Chapa webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }
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
