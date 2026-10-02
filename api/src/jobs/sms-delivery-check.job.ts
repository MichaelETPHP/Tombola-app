import { listRecentSmsMessages } from '../lib/sms.js';
import { logIntegrationEvent, hasLoggedDeliveryOutcome } from '../lib/integration-log.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 2 * 60_000;

/**
 * sendSms()'s own return value only reflects the gateway *accepting* a
 * message to queue — not whether the registered Android phone actually
 * sent it. That phone can sit on "Pending" for minutes or, per observed
 * real data, hours (battery optimization, lost connectivity, the gateway
 * app not running) before resolving to "Sent"/"Delivered" or "Failed"
 * with a native error like RESULT_ERROR_GENERIC_FAILURE — a failure this
 * app would otherwise never find out about, since nothing else ever asks
 * the gateway again after the initial accept.
 *
 * This sweep is deliberately read-only reconciliation, not a retry: it
 * pulls the gateway's own recent-message history and, for anything that
 * has reached a terminal state (Delivered/Failed) and doesn't already
 * have a logged outcome, records one — giving the admin SMS log a true
 * delivery picture instead of just "the gateway said OK at send time."
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
    if (message.state !== 'Delivered' && message.state !== 'Failed') continue;
    try {
      if (await hasLoggedDeliveryOutcome(message.id)) continue;
      const failedRecipients = message.recipients.filter((r) => r.state === 'Failed');
      logIntegrationEvent('sms', failedRecipients.length ? 'error' : 'success', 'delivery_status', {
        messageId: message.id,
        state: message.state,
        to: message.recipients[0]?.phoneNumber,
        error: failedRecipients[0]?.error,
      });
    } catch (error) {
      logger.error(`SMS delivery check failed for message ${message.id}`, error instanceof Error ? error.message : error);
    }
  }
}

export function startSmsDeliveryCheck(): void {
  logger.info(`Starting SMS delivery check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(checkSmsDeliveryStatus, CHECK_INTERVAL_MS);
}
