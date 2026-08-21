import { Hono } from 'hono';
import { chapaWebhookSchema } from './payments.schema.js';
import { processPaymentSuccess, processPaymentFailure } from './payments.service.js';
import { verifyChapaWebhookSignature } from '../../lib/payment-gateway.js';
import { logger } from '../../lib/logger.js';
import type { AppEnv } from '../../types/hono.js';

export const paymentsRoutes = new Hono<AppEnv>();

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
  } else if (process.env.NODE_ENV === 'production') {
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
