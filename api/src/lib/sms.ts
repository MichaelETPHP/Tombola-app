import { env } from '../config/env.js';
import { logger } from './logger.js';
import { logIntegrationEvent } from './integration-log.js';
import { ticketDisplayNumber } from './ticket-display-number.js';

export interface SendSmsOptions {
  to: string;
  message: string;
  /** Labels the admin log entry (e.g. 'otp', 'ticket_confirmation') — never the message body itself, which can carry an OTP code or other one-time-sensitive text that has no business sitting in a queryable log table. */
  event?: string;
}

export interface SmsGatewayResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface GatewaySendSuccess {
  id: string;
  state: string;
  recipients: { phoneNumber: string; state: string; error?: string }[];
}

export interface BulkSmsRecipientResult {
  phoneNumber: string;
  success: boolean;
  error?: string;
}

export interface BulkSmsResponse {
  success: boolean;
  messageId?: string;
  recipients: BulkSmsRecipientResult[];
  error?: string;
}

/**
 * The gateway's 3rdparty API rejects local-format numbers outright (400
 * "invalid phone number") — it requires E.164. Callers throughout this app
 * pass Ethiopian local format (0916182957), so normalize that one specific,
 * known shape here rather than pushing this concern onto every caller.
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+251${digits.slice(1)}`;
  if (digits.startsWith('251')) return `+${digits}`;
  return phone;
}

/**
 * SMS Gateway client for OTP and notification delivery, backed by a private
 * self-hosted android-sms-gateway 3rdparty API (HTTP Basic Auth, relays
 * through a registered Android phone's own SIM).
 */
/**
 * What the admin SMS log is allowed to keep of a message body. Every event
 * except 'otp' logs the real text verbatim — that's the whole point of the
 * log viewer. 'otp' is the one deliberate exception: the six-digit code is
 * a live credential for the next few minutes, and a log table an admin (or
 * anyone who ever gains read access to it) can browse is not a safe place
 * for it to sit — same reasoning as the log never storing full card
 * numbers. The surrounding template text still logs, just with the code
 * itself replaced.
 */
function messageForLog(event: string, message: string): string {
  return event === 'otp' ? message.replace(/\d{4,8}/, '••••••') : message;
}

export async function sendSms(options: SendSmsOptions): Promise<SmsGatewayResponse> {
  const { to, message, event = 'send' } = options;
  const loggedMessage = messageForLog(event, message);

  if (!env.SMS_API_URL || !env.SMS_API_USERNAME || !env.SMS_API_PASSWORD) {
    // In development, log the OTP instead of sending
    if (env.NODE_ENV === 'development') {
      logger.warn(`[SMS DEV MODE] To: ${to}, Message: ${message}`);
      return { success: true, messageId: 'dev-mode' };
    }
    logIntegrationEvent('sms', 'error', event, { to, message: loggedMessage, error: 'SMS gateway not configured' });
    throw new Error('SMS gateway not configured: SMS_API_URL/SMS_API_USERNAME/SMS_API_PASSWORD required');
  }

  try {
    const response = await fetch(`${env.SMS_API_URL.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${env.SMS_API_USERNAME}:${env.SMS_API_PASSWORD}`).toString('base64')}`,
      },
      body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [toE164(to)] }),
    });

    const data = await response.json().catch(() => null) as
      | GatewaySendSuccess
      | { message: string }
      | null;

    if (!response.ok || !data || !('id' in data)) {
      const errorMessage = data && 'message' in data ? data.message : `HTTP ${response.status}`;
      logger.error(`SMS send failed (${response.status}): ${errorMessage}`);
      logIntegrationEvent('sms', 'error', event, { to, message: loggedMessage, httpStatus: response.status, error: errorMessage });
      return { success: false, error: errorMessage };
    }

    logIntegrationEvent('sms', 'success', event, { to, message: loggedMessage, messageId: data.id });
    return { success: true, messageId: data.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
    logger.error(`SMS send exception: ${errorMessage}`);
    logIntegrationEvent('sms', 'error', event, { to, message: loggedMessage, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

export interface LiveCheckResult {
  reachable: boolean;
  latencyMs: number;
  message: string;
}

/**
 * Reachability probe for the admin Integrations page — deliberately never
 * sends an actual message. A GET against the gateway's own base URL isn't
 * a documented endpoint of this 3rdparty API, but that's fine: any HTTP
 * response at all (even a 404) proves the host is up and answering, which
 * is everything this needs to know. Only a network-level failure (refused,
 * timed out, DNS failure) means "unreachable" — this never touches
 * integration_logs, since a synthetic check isn't a real send attempt.
 */
export async function pingSmsGateway(): Promise<LiveCheckResult> {
  const start = Date.now();
  if (!env.SMS_API_URL || !env.SMS_API_USERNAME || !env.SMS_API_PASSWORD) {
    return { reachable: false, latencyMs: 0, message: 'SMS gateway not configured' };
  }
  try {
    const response = await fetch(env.SMS_API_URL.replace(/\/$/, ''), {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'Authorization': `Basic ${Buffer.from(`${env.SMS_API_USERNAME}:${env.SMS_API_PASSWORD}`).toString('base64')}`,
      },
    });
    return {
      reachable: true,
      latencyMs: Date.now() - start,
      message: `Gateway responded (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

/** A phone that survives `toE164` normalization still matching Ethiopian E.164 shape. */
function isValidE164(phone: string): boolean {
  return /^\+251[0-9]{9}$/.test(phone);
}

/**
 * Send one message to many recipients in a single gateway request — the
 * 3rdparty API accepts a `phoneNumbers` array natively (confirmed: one
 * request with N numbers returns one message id with a per-recipient
 * `recipients[]` breakdown), so this is one HTTP call regardless of batch
 * size, not a loop of N calls.
 *
 * Malformed/unnormalizable numbers are excluded from the request entirely
 * (reported back as failed with a clear reason) rather than letting one
 * bad row reject the whole batch.
 */
export async function sendBulkSms(phones: string[], message: string): Promise<BulkSmsResponse> {
  const normalized = phones.map((phone) => ({ original: phone, e164: toE164(phone) }));
  const valid = normalized.filter((p) => isValidE164(p.e164));
  const invalid: BulkSmsRecipientResult[] = normalized
    .filter((p) => !isValidE164(p.e164))
    .map((p) => ({ phoneNumber: p.original, success: false, error: 'Invalid phone number format' }));

  if (valid.length === 0) {
    return { success: false, recipients: invalid, error: 'No valid phone numbers to send to' };
  }

  if (!env.SMS_API_URL || !env.SMS_API_USERNAME || !env.SMS_API_PASSWORD) {
    if (env.NODE_ENV === 'development') {
      logger.warn(`[SMS DEV MODE] To: ${valid.map((p) => p.e164).join(', ')}, Message: ${message}`);
      return {
        success: true,
        messageId: 'dev-mode',
        recipients: [...valid.map((p) => ({ phoneNumber: p.e164, success: true })), ...invalid],
      };
    }
    throw new Error('SMS gateway not configured: SMS_API_URL/SMS_API_USERNAME/SMS_API_PASSWORD required');
  }

  try {
    const response = await fetch(`${env.SMS_API_URL.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${env.SMS_API_USERNAME}:${env.SMS_API_PASSWORD}`).toString('base64')}`,
      },
      body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: valid.map((p) => p.e164) }),
    });

    const data = await response.json().catch(() => null) as
      | GatewaySendSuccess
      | { message: string }
      | null;

    if (!response.ok || !data || !('id' in data)) {
      const errorMessage = data && 'message' in data ? data.message : `HTTP ${response.status}`;
      logger.error(`Bulk SMS send failed (${response.status}): ${errorMessage}`);
      // The whole batch request itself failed (not a per-recipient
      // rejection) — every intended recipient gets its own log row anyway,
      // same as the success path, so the log viewer's "who got this
      // broadcast" view doesn't have a gap for the one failure mode that
      // isn't per-recipient.
      for (const p of valid) {
        logIntegrationEvent('sms', 'error', 'bulk_send', { to: p.e164, message, httpStatus: response.status, error: errorMessage });
      }
      return {
        success: false,
        error: errorMessage,
        recipients: [...valid.map((p) => ({ phoneNumber: p.e164, success: false, error: errorMessage })), ...invalid],
      };
    }

    const sentResults: BulkSmsRecipientResult[] = data.recipients.map((r) => ({
      phoneNumber: r.phoneNumber,
      success: r.state !== 'Failed',
      error: r.state === 'Failed' ? (r.error ?? 'Rejected by gateway') : undefined,
    }));

    // One log row per recipient — this is what lets the admin SMS log show
    // "was THIS specific phone number delivered" rather than only a
    // batch-level success/fail count.
    for (const r of sentResults) {
      logIntegrationEvent('sms', r.success ? 'success' : 'error', 'bulk_send', {
        to: r.phoneNumber, message, messageId: data.id, error: r.error,
      });
    }
    return { success: true, messageId: data.id, recipients: [...sentResults, ...invalid] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
    logger.error(`Bulk SMS send exception: ${errorMessage}`);
    for (const p of valid) {
      logIntegrationEvent('sms', 'error', 'bulk_send', { to: p.e164, message, error: errorMessage });
    }
    return {
      success: false,
      error: errorMessage,
      recipients: [...valid.map((p) => ({ phoneNumber: p.e164, success: false, error: errorMessage })), ...invalid],
    };
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
    event: 'otp',
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
    event: 'trigger_link',
    message: `🎉 You've been selected to trigger the raffle draw! Tap here: ${link} — This link expires in 1 hour.`,
  });
}

const YENEETA_BOT_LINK = 'http://t.me/YeneEta_ETBOT/start';

/**
 * Send a confirmation once a ticket purchase is paid for and tickets are
 * issued. Every ticket number gets its own line rather than a comma-joined
 * list — a buyer skimming this on a lock screen should be able to pick out
 * "did my number get in" at a glance, not parse a run-on sentence. "Good
 * luck" is bilingual unconditionally (not switched by locale) — same
 * deliberate choice as the in-app payment-success screen's bilingual line.
 */
export async function sendTicketPurchaseConfirmation(
  phone: string,
  details: { raffleName: string; raffleCode: string; ticketNumbers: number[]; numberSeed: number | null }
): Promise<SmsGatewayResponse> {
  const codes = details.ticketNumbers.map((n) => `${details.raffleCode}-${ticketDisplayNumber(details.numberSeed, n)}`);
  const count = codes.length;
  const message = [
    `🎉 Thank you for your purchase!`,
    `Raffle: ${details.raffleName}`,
    `Your ticket${count === 1 ? '' : 's'}:`,
    ...codes,
    `Good luck! · መልካም እድል!`,
    YENEETA_BOT_LINK,
  ].join('\n');
  return sendSms({ to: phone, message, event: 'ticket_confirmation' });
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
    event: 'draw_invitation',
    message: `YeneEta draw invitation: ${details.prizeLabel} (${details.prizeName}) for "${details.raffleName}". Opened ${format.format(details.drawAt)}. Open ${details.link} to run the draw. Link expires ${format.format(details.expiresAt)}.`,
  });
}
