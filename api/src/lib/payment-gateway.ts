import { createHmac, timingSafeEqual } from 'node:crypto';
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
    callbackUrl?: string;
  };
}

export interface ChapaInitResponse {
  status: string;
  message: string;
  data?: {
    checkout_url: string;
  };
}

export interface ChapaVerifyResponse {
  status: string;
  message?: string;
  data?: {
    status?: string;
    tx_ref?: string;
    amount?: string | number;
    currency?: string;
    mode?: string;
    reference?: string;
    [key: string]: unknown;
  };
}

// Chapa rejects customization.title/description containing anything
// outside letters, numbers, hyphens, underscores, spaces, and dots (an
// admin-entered raffle title can contain anything — quotes, colons,
// emoji, parentheses — so this is a hard backstop regardless of what the
// caller already tried to keep clean). Title is also capped well under
// Chapa's ~16-character limit.
function sanitizeChapaText(text: string, maxLength: number): string {
  const cleaned = text.replace(/[^A-Za-z0-9\-_. ]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'YeneEta').slice(0, maxLength);
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
      callback_url: payload.mock?.callbackUrl ?? payload.callback_url,
      return_url: payload.return_url ?? '',
      title: payload.customization?.title ?? 'YeneEta',
      raffle_title: payload.mock?.raffleTitle ?? payload.customization?.title ?? 'YeneEta raffle',
      ticket_count: String(payload.mock?.ticketCount ?? 1),
      unit_price: String(payload.mock?.unitPrice ?? payload.amount),
      // Only present when the deployer has opted in — see
      // MOCK_PAYMENTS_SECRET in config/env.ts. Lets mock-checkout's own
      // confirmation POST authorize itself to the webhook.
      ...(env.MOCK_PAYMENTS_SECRET ? { mock_secret: env.MOCK_PAYMENTS_SECRET } : {}),
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
  if (gatewayPayload.customization) {
    const { title, description } = gatewayPayload.customization;
    gatewayPayload.customization = {
      ...(title ? { title: sanitizeChapaText(title, 16) } : {}),
      ...(description ? { description: sanitizeChapaText(description, 100) } : {}),
    };
  }
  const response = await fetch('https://api.chapa.co/v1/transaction/initialize', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
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
export async function chapaVerify(txRef: string): Promise<ChapaVerifyResponse> {
  if (!env.CHAPA_SECRET_KEY) {
    throw new Error('CHAPA_SECRET_KEY not configured');
  }

  const response = await fetch(`https://api.chapa.co/v1/transaction/verify/${txRef}`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Authorization': `Bearer ${env.CHAPA_SECRET_KEY}`,
    },
  });

  const data = await response.json() as ChapaVerifyResponse;

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
export function verifyChapaWebhookSignature(
  body: string,
  signatures: { payload?: string; secret?: string }
): boolean {
  if (!env.CHAPA_WEBHOOK_SECRET) {
    logger.warn('CHAPA_WEBHOOK_SECRET not configured — rejecting webhook');
    return false;
  }

  const computedHash = createHmac('sha256', env.CHAPA_WEBHOOK_SECRET).update(body).digest('hex');
  const computedSecretHash = createHmac('sha256', env.CHAPA_WEBHOOK_SECRET)
    .update(env.CHAPA_WEBHOOK_SECRET)
    .digest('hex');

  // A plain `===` here leaks how many leading bytes matched through
  // response timing — enough samples let an attacker forge a valid
  // signature byte-by-byte without ever knowing CHAPA_WEBHOOK_SECRET,
  // then POST a fake "payment succeeded" webhook. timingSafeEqual takes
  // the same time regardless of where the strings first differ.
  const computedBuf = Buffer.from(computedHash, 'utf8');
  const payloadSignatureBuf = Buffer.from((signatures.payload ?? '').trim().toLowerCase(), 'utf8');
  const secretHashBuf = Buffer.from(computedSecretHash, 'utf8');
  const secretSignatureBuf = Buffer.from((signatures.secret ?? '').trim().toLowerCase(), 'utf8');
  const payloadMatches = computedBuf.length === payloadSignatureBuf.length
    && timingSafeEqual(computedBuf, payloadSignatureBuf);
  const secretMatches = secretHashBuf.length === secretSignatureBuf.length
    && timingSafeEqual(secretHashBuf, secretSignatureBuf);
  return payloadMatches || secretMatches;
}

/**
 * Authorizes the mock-checkout page's own unsigned webhook POST — see
 * MOCK_PAYMENTS_SECRET in config/env.ts. Requires the secret to actually
 * be configured (an unset MOCK_PAYMENTS_SECRET never matches, even
 * against an empty provided value) and compares with the same
 * timing-safe approach as the real Chapa signature above.
 */
export function verifyMockPaymentSecret(provided: string): boolean {
  if (!env.MOCK_PAYMENTS_SECRET || !provided) return false;
  const expectedBuf = Buffer.from(env.MOCK_PAYMENTS_SECRET, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
