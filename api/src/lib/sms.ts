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

/**
 * SMS Gateway client for OTP and notification delivery.
 *
 * Currently a generic HTTP-based implementation.
 * Replace the fetch call with your specific provider's API
 * (e.g., Africa's Talking, Twilio, local Ethiopian gateway).
 */
export async function sendSms(options: SendSmsOptions): Promise<SmsGatewayResponse> {
  const { to, message } = options;

  if (!env.SMS_API_URL || !env.SMS_API_KEY) {
    // In development, log the OTP instead of sending
    if (env.NODE_ENV === 'development') {
      logger.warn(`[SMS DEV MODE] To: ${to}, Message: ${message}`);
      return { success: true, messageId: 'dev-mode' };
    }
    throw new Error('SMS gateway not configured: SMS_API_URL and SMS_API_KEY required');
  }

  try {
    const response = await fetch(env.SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SMS_API_KEY}`,
      },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`SMS send failed: ${response.status} — ${errorBody}`);
      return { success: false, error: `HTTP ${response.status}: ${errorBody}` };
    }

    const data = await response.json() as { id?: string };
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
export async function sendOtp(phone: string, code: string): Promise<SmsGatewayResponse> {
  return sendSms({
    to: phone,
    message: `Your Tombola verification code is: ${code}. Valid for 5 minutes.`,
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
