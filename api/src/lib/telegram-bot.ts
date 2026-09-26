import { env } from '../config/env.js';
import { logger } from './logger.js';
import { logIntegrationEvent } from './integration-log.js';

export interface TelegramSendResult {
  success: boolean;
  error?: string;
}

/**
 * Sends a direct message from the platform's bot into a user's private
 * chat with it. The Bot API's `chat_id` for a DM is just the recipient's
 * Telegram numeric user id (users.telegram_user_id) — there's no separate
 * "chat id" to look up for a private bot conversation.
 *
 * Fire-and-forget by design at every call site (welcome DM, ticket
 * confirmation, admin bulk send): a failed Telegram DM must never block or
 * fail whatever it's celebrating/confirming, exactly like the SMS
 * equivalents this mirrors (see lib/sms.ts).
 */
export async function sendTelegramMessage(telegramUserId: string, text: string, event = 'send'): Promise<TelegramSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logIntegrationEvent('telegram', 'error', event, { to: telegramUserId, error: 'Telegram bot not configured' });
    return { success: false, error: 'Telegram bot not configured' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramUserId, text, disable_web_page_preview: true }),
    });

    const data = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;

    if (!response.ok || !data?.ok) {
      const errorMessage = data?.description ?? `HTTP ${response.status}`;
      // 403 here just means the user blocked the bot, or never started a
      // chat with it — routine and expected at some rate for any bulk
      // send, not an outage worth an error-level log entry.
      if (response.status === 403) {
        logger.warn(`Telegram DM blocked by user (telegramUserId=${telegramUserId})`);
      } else {
        logger.error(`Telegram DM send failed (${response.status}): ${errorMessage}`);
      }
      logIntegrationEvent('telegram', 'error', event, { to: telegramUserId, httpStatus: response.status, error: errorMessage });
      return { success: false, error: errorMessage };
    }

    logIntegrationEvent('telegram', 'success', event, { to: telegramUserId });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Telegram error';
    logger.error(`Telegram DM send exception: ${errorMessage}`);
    logIntegrationEvent('telegram', 'error', event, { to: telegramUserId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Sent the moment a brand-new account is created via Telegram — mirrors
 * sendWelcomeSms's content (lib/sms.ts), minus the "save this number" /
 * bot-link lines, which only make sense in an SMS that arrived from
 * outside Telegram. Someone reading this is already inside the bot chat.
 */
export async function sendTelegramWelcome(telegramUserId: string): Promise<TelegramSendResult> {
  const text = [
    '🎉 Welcome to 251 Lottery!',
    "Ethiopia's premier raffle platform — win amazing prizes with transparent, provably-fair draws.",
    'እንኳን ደህና መጡ · Welcome aboard!',
  ].join('\n');
  return sendTelegramMessage(telegramUserId, text, 'welcome');
}

/**
 * Sent once a purchase is paid for and tickets are issued — mirrors
 * sendTicketPurchaseConfirmation's content (lib/sms.ts) exactly, one
 * ticket number per line for the same skim-on-a-lock-screen reason.
 */
export async function sendTelegramTicketConfirmation(
  telegramUserId: string,
  details: { raffleName: string; ticketCodes: string[] }
): Promise<TelegramSendResult> {
  const count = details.ticketCodes.length;
  const text = [
    '🎉 Thank you for your purchase!',
    `Raffle: ${details.raffleName}`,
    `Your ticket${count === 1 ? '' : 's'}:`,
    ...details.ticketCodes,
    'Good luck! · መልካም እድል!',
  ].join('\n');
  return sendTelegramMessage(telegramUserId, text, 'ticket_confirmation');
}

export interface TelegramBulkRecipientResult {
  telegramUserId: string;
  success: boolean;
  error?: string;
}

// Telegram's own flood limit is roughly ~30 messages/sec to distinct
// chats — there's no bulk "send to N recipients" endpoint like the SMS
// gateway has, so a broadcast is just this loop with a small pacing delay
// between calls, comfortably under that ceiling.
const BULK_SEND_DELAY_MS = 40;

/** Sends the same message to many Telegram users, one at a time, paced. */
export async function sendBulkTelegramMessages(
  telegramUserIds: string[],
  text: string,
  event = 'bulk_send'
): Promise<TelegramBulkRecipientResult[]> {
  const results: TelegramBulkRecipientResult[] = [];
  for (let i = 0; i < telegramUserIds.length; i += 1) {
    const telegramUserId = telegramUserIds[i];
    const result = await sendTelegramMessage(telegramUserId, text, event);
    results.push({ telegramUserId, success: result.success, error: result.error });
    if (i < telegramUserIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BULK_SEND_DELAY_MS));
    }
  }
  return results;
}
