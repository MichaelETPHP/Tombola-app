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
  /** Local checkout presentation data. Removed before requests to Chapa. */
  mock?: {
    raffleTitle: string;
    ticketCount: number;
    unitPrice: number;
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
 *
 * In MOCK_PAYMENTS mode, skips the real Chapa API entirely and points the
 * user at a fake checkout page in the mobile app instead. That page still
 * calls the real callback_url (the webhook), so ticket issuance and the
 * payment-status polling page get exercised for real — only the "actually
 * charge a card" part is faked.
 */
export async function chapaInitialize(payload: ChapaInitPayload): Promise<ChapaInitResponse> {
  if (env.MOCK_PAYMENTS) {
    const mockParams = new URLSearchParams({
      tx_ref: payload.tx_ref,
      amount: String(payload.amount),
      callback_url: payload.callback_url,
      return_url: payload.return_url ?? '',
      title: payload.customization?.title ?? 'Tombola',
      raffle_title: payload.mock?.raffleTitle ?? payload.customization?.title ?? 'Tombola raffle',
      ticket_count: String(payload.mock?.ticketCount ?? 1),
      unit_price: String(payload.mock?.unitPrice ?? payload.amount),
    });
    return {
      status: 'success',
      message: 'Mock checkout (MOCK_PAYMENTS=true)',
      data: {
        checkout_url: `${env.MOBILE_APP_URL}/mock-checkout?${mockParams.toString()}`,
      },
    };
  }

  if (!env.CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY not configured');
  }

  const { mock: _mock, ...gatewayPayload } = payload;
  const response = await fetch('https://api.chapa.co/v1/transaction/initialize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CHAPA_SECRET_KEY}`,
    },
    body: JSON.stringify(gatewayPayload),
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
