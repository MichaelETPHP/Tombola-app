import { listRecentSmsMessages } from '../lib/sms.js';
import { getLoggedSmsState, recordSmsDeliveryState } from '../lib/integration-log.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 20_000;

const FAILURE_STATES = new Set(['Failed']);

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
    } catch (error) {
      logger.error(`SMS delivery check failed for message ${message.id}`, error instanceof Error ? error.message : error);
    }
  }
}

export function startSmsDeliveryCheck(): void {
  logger.info(`Starting SMS delivery check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkSmsDeliveryStatus, CHECK_INTERVAL_MS);
}
