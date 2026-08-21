import { env } from '../config/env.js';
import { logger } from './logger.js';

// ─── Chapa Integration ───────────────────────────────────────────

export interface ChapaInitPayload {
  amount: number;
  currency: 'ETB';
  email?: string;
  phone_number: string;
  tx_ref: string;
  callback_url: string;
  return_url?: string;
  customization?: {
    title?: string;
    description?: string;
  };
}

export interface ChapaInitResponse {
  status: string;
  message: string;
  data?: {
    checkout_url: string;
  };
}

/**
 * Initialize a Chapa payment transaction.
 */
export async function chapaInitialize(payload: ChapaInitPayload): Promise<ChapaInitResponse> {
  if (!env.CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY not configured');
  }

  const response = await fetch('https://api.chapa.co/v1/transaction/initialize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CHAPA_SECRET_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as ChapaInitResponse;

  if (!response.ok) {
    logger.error(`Chapa init failed: ${JSON.stringify(data)}`);
    throw new Error(`Chapa payment initialization failed: ${data.message}`);
  }

  return data;
}

/**
 * Verify a Chapa payment by transaction reference.
 */
export async function chapaVerify(txRef: string): Promise<Record<string, unknown>> {
  if (!env.CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY not configured');
  }

  const response = await fetch(`https://api.chapa.co/v1/transaction/verify/${txRef}`, {
    headers: {
      'Authorization': `Bearer ${env.CHAPA_SECRET_KEY}`,
    },
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    logger.error(`Chapa verify failed for ${txRef}: ${JSON.stringify(data)}`);
    throw new Error(`Chapa verification failed for tx_ref: ${txRef}`);
  }

  return data;
}

/**
 * Verify the webhook signature from Chapa.
 * Compares the hash of the request body with the provided signature header.
 */
export async function verifyChapaWebhookSignature(
  body: string,
  signature: string
): Promise<boolean> {
  if (!env.CHAPA_WEBHOOK_SECRET) {
    logger.warn('CHAPA_WEBHOOK_SECRET not configured — skipping signature verification');
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.CHAPA_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHash === signature;
}
