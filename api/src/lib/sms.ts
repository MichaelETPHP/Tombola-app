import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface SendSmsOptions {
  to: string;
  message: string;
}

export interface SmsGatewayResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** SMS Ethiopia (smsethiopia.com) API v2 send endpoint — same auth/body as v1. */
const SMS_ETHIOPIA_SEND_URL = 'https://smsethiopia.com/api/v2/sms/send';

interface SmsEthiopiaSuccess {
  sent: true;
  id: string;
  description: string;
  segments: number;
  status: string;
}

/** SMS Ethiopia requires MSISDN as `2519XXXXXXXX` — 12 digits, no `+`. */
function toMsisdn(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * SMS Gateway client for OTP and notification delivery, backed by
 * SMS Ethiopia (smsethiopia.com) API v2.
 * https://smsethiopia.com/#/landing/docs/api-v2
 */
export async function sendSms(options: SendSmsOptions): Promise<SmsGatewayResponse> {
  const { to, message } = options;

  if (!env.SMS_API_KEY) {
    // In development, log the OTP instead of sending
    if (env.NODE_ENV === 'development') {
      logger.warn(`[SMS DEV MODE] To: ${to}, Message: ${message}`);
      return { success: true, messageId: 'dev-mode' };
    }
    throw new Error('SMS gateway not configured: SMS_API_KEY required');
  }

  try {
    const response = await fetch(env.SMS_API_URL || SMS_ETHIOPIA_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'KEY': env.SMS_API_KEY,
      },
      body: JSON.stringify({ msisdn: toMsisdn(to), text: message }),
    });

    const data = await response.json().catch(() => null) as
      | SmsEthiopiaSuccess
      | { error_message: string }
      | Record<string, string>
      | null;

    if (!response.ok || !data || !('sent' in data && data.sent)) {
      const errorMessage =
        data && 'error_message' in data ? data.error_message
        : data ? Object.values(data).join('; ')
        : `HTTP ${response.status}`;
      logger.error(`SMS send failed (${response.status}): ${errorMessage}`);
      return { success: false, error: errorMessage };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
    logger.error(`SMS send exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send an OTP code via SMS.
 */
export async function sendOtp(phone: string, code: string, locale: 'en' | 'am' = 'en'): Promise<SmsGatewayResponse> {
  // Explicit mock mode is allowed on a production-built test deployment.
  // Do not call a missing SMS gateway and do not log the generated code;
  // verification accepts the fixed demo code while this flag is enabled.
  if (env.DEMO_OTP_ENABLED) {
    logger.warn(`[SMS DEMO MODE] OTP delivery skipped for ${phone.slice(-4).padStart(phone.length, '*')}`);
    return { success: true, messageId: 'demo-mode' };
  }

  return sendSms({
    to: phone,
    message: locale === 'am'
      ? `የYeneEta ማረጋገጫ ኮድዎ ${code} ነው። ለ5 ደቂቃ ያገለግላል።`
      : `Your YeneEta verification code is ${code}. It is valid for 5 minutes.`,
  });
}

/**
 * Send a trigger link via SMS to the selected participant.
 */
export async function sendTriggerLink(phone: string, link: string): Promise<SmsGatewayResponse> {
  return sendSms({
    to: phone,
    message: `🎉 You've been selected to trigger the raffle draw! Tap here: ${link} — This link expires in 1 hour.`,
  });
}

/** Send a confirmation once a ticket purchase is paid for and tickets are issued. */
export async function sendTicketPurchaseConfirmation(
  phone: string,
  details: { raffleName: string; raffleCode: string; ticketNumbers: number[] }
): Promise<SmsGatewayResponse> {
  const codes = details.ticketNumbers.map((n) => `${details.raffleCode}-${String(n).padStart(5, '0')}`);
  const count = codes.length;
  const list = count <= 3 ? codes.join(', ') : `${codes.slice(0, 3).join(', ')} +${count - 3} more`;
  return sendSms({
    to: phone,
    message: `YeneEta: Payment received! You bought ${count} ticket${count === 1 ? '' : 's'} for "${details.raffleName}": ${list}. Good luck!`,
  });
}

/** Send one prize tier's single-use draw invitation with its context. */
export async function sendDrawInvitation(
  phone: string,
  details: {
    link: string;
    raffleName: string;
    prizeLabel: string;
    prizeName: string;
    drawAt: Date;
    expiresAt: Date;
  }
): Promise<SmsGatewayResponse> {
  const format = new Intl.DateTimeFormat('en-ET', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Addis_Ababa',
  });
  return sendSms({
    to: phone,
    message: `YeneEta draw invitation: ${details.prizeLabel} (${details.prizeName}) for "${details.raffleName}". Opened ${format.format(details.drawAt)}. Open ${details.link} to run the draw. Link expires ${format.format(details.expiresAt)}.`,
  });
}
