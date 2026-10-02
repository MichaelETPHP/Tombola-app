import { sql } from '../db/client.js';
import { logger } from './logger.js';

export type IntegrationKey = 'sms' | 'chapa' | 'telegram';
export type IntegrationLogStatus = 'success' | 'error';

export interface IntegrationLogEntry {
  id: string;
  integration: IntegrationKey;
  status: IntegrationLogStatus;
  event: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

const MAX_LOG_ROWS = 2000;

/**
 * Records one outbound integration call, success or failure. Fire-and-forget
 * by design (callers never `await` this for its own sake, and a failure to
 * log must never fail the SMS/payment call it's describing) — errors here
 * only reach the structured stdout logger, not this table.
 *
 * Trims to the last MAX_LOG_ROWS on a random 1-in-20 write rather than every
 * write: precise enforcement doesn't matter for an admin log viewer, and
 * this is a small raffle platform's write volume, not something that needs
 * a scheduled job.
 */
export function logIntegrationEvent(
  integration: IntegrationKey,
  status: IntegrationLogStatus,
  event: string,
  detail: Record<string, unknown> = {}
): void {
  void (async () => {
    try {
      // Round-tripped through JSON here — `detail` is typed as
      // Record<string, unknown> for caller convenience (error objects,
      // etc.), but sql.json()'s JSONValue type (rightly) won't accept
      // arbitrary unknowns. This both satisfies that and guarantees the
      // value is actually plain-JSON-safe at runtime, not just in theory.
      const jsonSafeDetail = JSON.parse(JSON.stringify(detail));
      await sql`
        INSERT INTO "Tombola_DB".integration_logs (integration, status, event, detail)
        VALUES (${integration}, ${status}, ${event}, ${sql.json(jsonSafeDetail)})
      `;
      if (Math.random() < 0.05) {
        await sql`
          DELETE FROM "Tombola_DB".integration_logs
          WHERE id NOT IN (
            SELECT id FROM "Tombola_DB".integration_logs
            ORDER BY created_at DESC
            LIMIT ${MAX_LOG_ROWS}
          )
        `;
      }
    } catch (error) {
      logger.error(`Failed to write integration log (${integration}/${event})`, error instanceof Error ? error.message : error);
    }
  })();
}

/**
 * The delivery state already recorded against this gateway message id
 * (e.g. "Processing", "Sent", "Delivered", "Failed"), or null if the
 * gateway sweep hasn't recorded one yet. Used by sms-delivery-check.job.ts
 * to skip a sweep that finds nothing new for a message (the overwhelmingly
 * common case once it has settled).
 */
export async function getLoggedSmsState(messageId: string): Promise<string | null> {
  const rows = await sql<{ state: string | null }[]>`
    SELECT detail->>'state' AS state FROM "Tombola_DB".integration_logs
    WHERE integration = 'sms' AND detail->>'messageId' = ${messageId}
    LIMIT 1
  `;
  return rows[0]?.state ?? null;
}

/**
 * Records this gateway message's current delivery state onto its own
 * original send-time log row — an UPDATE, never a new INSERT. The admin
 * SMS log must show exactly one line per message (send attempt), whose
 * status transitions live as the gateway reports Processing -> Sent ->
 * Delivered/Failed; writing a second row per transition would turn one
 * message into several duplicate-looking log entries.
 */
export async function recordSmsDeliveryState(
  messageId: string,
  state: string,
  status: IntegrationLogStatus,
  error?: string
): Promise<void> {
  await sql`
    UPDATE "Tombola_DB".integration_logs
    SET status = ${status},
        detail = detail || jsonb_build_object('state', ${state}, 'error', ${error ?? null})
    WHERE integration = 'sms' AND detail->>'messageId' = ${messageId}
  `;
}

/**
 * The original send's recipient/message/event for a failed gateway message,
 * plus whether it's already been retried once — sms-delivery-check.job.ts's
 * only source of truth for "can/should this be retried," since the retry
 * itself (see retrySms in sms.ts) needs the exact original text, and must
 * never fire more than once per message.
 */
export async function getSmsRetryCandidate(messageId: string): Promise<{
  to: string;
  message: string;
  event: string;
  retried: boolean;
} | null> {
  const rows = await sql<{ to: string | null; message: string | null; event: string; retried: boolean | null }[]>`
    SELECT detail->>'to' AS to, detail->>'message' AS message, event, (detail->>'retried')::boolean AS retried
    FROM "Tombola_DB".integration_logs
    WHERE integration = 'sms' AND detail->>'messageId' = ${messageId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.to || !row.message) return null;
  return { to: row.to, message: row.message, event: row.event, retried: row.retried ?? false };
}

/**
 * Rebinds a message's log row to the gateway message id created by its one
 * retry attempt, and resets state/status back to "in flight" — the next
 * delivery-check sweep then tracks the RETRY's own progress against this
 * same row (Processing/Sent/Delivered/Failed), so a retried send still
 * reads as one compact line that recovered, not a second log entry.
 * `retried: true` is set unconditionally so this row is never retried again
 * regardless of how the retry itself turns out.
 */
export async function rebindSmsRetry(oldMessageId: string, newMessageId: string): Promise<void> {
  await sql`
    UPDATE "Tombola_DB".integration_logs
    SET status = 'success',
        detail = (detail || jsonb_build_object('messageId', ${newMessageId}, 'retried', true)) - 'state' - 'error'
    WHERE integration = 'sms' AND detail->>'messageId' = ${oldMessageId}
  `;
}

/** The retry attempt itself never reached the gateway — mark it retried (so it's never tried again) and keep the original failure visible. */
export async function markSmsRetryFailed(messageId: string, error: string): Promise<void> {
  await sql`
    UPDATE "Tombola_DB".integration_logs
    SET detail = detail || jsonb_build_object('retried', true, 'error', ${error})
    WHERE integration = 'sms' AND detail->>'messageId' = ${messageId}
  `;
}

export interface IntegrationLogFilter {
  integration?: IntegrationKey;
  status?: IntegrationLogStatus;
  /** Exact match against detail->>'to' — the SMS recipient. Powers the
   * admin user-detail page's "Message history" section. Every phone
   * entering this app is already normalized to +251XXXXXXXXX at the auth
   * boundary, so an exact match is reliable, same reasoning as
   * findUsersByPhones. */
  phone?: string;
  limit: number;
  before?: string;
}

/** Paginated log read for the admin log viewer — newest first, keyset-paged on createdAt. */
export async function listIntegrationLogs(filter: IntegrationLogFilter): Promise<IntegrationLogEntry[]> {
  const { integration, status, phone, limit, before } = filter;
  // Typed with `createdAt`, not `created_at` — the postgres client
  // auto-camelCases every returned column (see db/client.ts's
  // transform.column.from), so the runtime object never actually has a
  // `created_at` key even though the SQL below selects one. Typing this
  // as `created_at` previously silenced the type-checker while every row
  // silently carried `createdAt: undefined` — which JSON.stringify then
  // drops entirely, so the client got no createdAt at all.
  const rows = await sql<{
    id: string;
    integration: IntegrationKey;
    status: IntegrationLogStatus;
    event: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }[]>`
    SELECT id, integration, status, event, detail, created_at
    FROM "Tombola_DB".integration_logs
    WHERE (${integration ?? null}::text IS NULL OR integration = ${integration ?? null})
      AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      AND (${phone ?? null}::text IS NULL OR detail->>'to' = ${phone ?? null})
      AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    integration: row.integration,
    status: row.status,
    event: row.event,
    detail: row.detail,
    createdAt: row.createdAt,
  }));
}
