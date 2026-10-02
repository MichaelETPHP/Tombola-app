import { listRecentSmsMessages, retrySms } from '../lib/sms.js';
import {
  getLoggedSmsState,
  recordSmsDeliveryState,
  getSmsRetryCandidate,
  rebindSmsRetry,
  markSmsRetryFailed,
} from '../lib/integration-log.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 20_000;

const FAILURE_STATES = new Set(['Failed']);

/**
 * Events eligible for the one automatic retry below. Deliberately an
 * allowlist of single-recipient transactional sends only, not every event
 * name — 'otp' is excluded because its logged message has the code
 * redacted (see messageForLog in sms.ts), so there's no real text left to
 * resend; 'bulk_send'/'contacts_broadcast'/the default 'send' bucket are
 * excluded because those can share one gateway message id across many
 * recipients, where retrying off a single log row could resend to the
 * wrong person.
 */
const RETRYABLE_EVENTS = new Set([
  'ticket_confirmation',
  'trigger_link',
  'draw_invitation',
  'draw_winner',
  'representative_invitation',
  'welcome',
  'admin_direct_send',
]);

/**
 * sendSms()'s own return value only reflects the gateway *accepting* a
 * message to queue — not whether the registered Android phone actually
 * sent it. The phone itself is confirmed reliably online every day, so a
 * message sitting unresolved isn't a connectivity question; it still goes
 * through Pending -> Processing -> Sent -> Delivered (or Failed, with a
 * native error like RESULT_ERROR_GENERIC_FAILURE) on the gateway's own
 * clock, and nothing else here ever asks the gateway again after the
 * initial accept.
 *
 * This sweep is read-only reconciliation, not a retry: it pulls the
 * gateway's recent-message history and, for every message whose current
 * state differs from what's already recorded, updates that message's own
 * log row in place (see recordSmsDeliveryState) — so the admin SMS log
 * shows the real pipeline live (Processing/Sent/Delivered/Failed) on one
 * line per message, never a growing trail of duplicate rows.
 *
 * A message that lands on Failed gets exactly one automatic retry (see
 * retryFailedSms) — the android-sms-gateway project's own production
 * guidance recommends retry logic, and real gateway data showed most
 * failures are a few-second radio hiccup (SIM mid-reacquisition), not a
 * persistent problem, so a single retry a moment later clears most of them.
 */
async function checkSmsDeliveryStatus(): Promise<void> {
  let messages;
  try {
    messages = await listRecentSmsMessages();
  } catch (error) {
    logger.error('SMS delivery check: could not reach gateway', error instanceof Error ? error.message : error);
    return;
  }

  for (const message of messages) {
    // "Pending" is the gateway's queued-but-not-yet-touched state — same
    // as the send-time entry every message already gets, so there's
    // nothing new to record.
    if (message.state === 'Pending') continue;
    try {
      const loggedState = await getLoggedSmsState(message.id);
      if (loggedState === message.state) continue;
      const failedRecipients = message.recipients.filter((r) => FAILURE_STATES.has(r.state));
      await recordSmsDeliveryState(
        message.id,
        message.state,
        failedRecipients.length ? 'error' : 'success',
        failedRecipients[0]?.error
      );

      if (message.state === 'Failed') {
        await retryFailedSms(message.id);
      }
    } catch (error) {
      logger.error(`SMS delivery check failed for message ${message.id}`, error instanceof Error ? error.message : error);
    }
  }
}

async function retryFailedSms(messageId: string): Promise<void> {
  const candidate = await getSmsRetryCandidate(messageId);
  if (!candidate || candidate.retried) return;
  if (!RETRYABLE_EVENTS.has(candidate.event)) return;
  // Defensive: a real recipient always normalizes to E.164 (+2519... or a
  // bare 10-digit local number) — anything else (e.g. contacts_broadcast's
  // "N contacts" summary placeholder) isn't a phone number to retry.
  if (!/^\+?\d{9,15}$/.test(candidate.to)) return;

  const result = await retrySms(candidate.to, candidate.message);
  if (result.success && result.messageId) {
    await rebindSmsRetry(messageId, result.messageId);
    logger.info(`SMS retry succeeded for ${messageId} -> new message ${result.messageId}`);
  } else {
    await markSmsRetryFailed(messageId, result.error ?? 'retry failed');
    logger.warn(`SMS retry failed for ${messageId}: ${result.error ?? 'unknown error'}`);
  }
}

export function startSmsDeliveryCheck(): void {
  logger.info(`Starting SMS delivery check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkSmsDeliveryStatus, CHECK_INTERVAL_MS);
}
