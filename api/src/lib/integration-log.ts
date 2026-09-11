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

export interface IntegrationLogFilter {
  integration?: IntegrationKey;
  status?: IntegrationLogStatus;
  limit: number;
  before?: string;
}

/** Paginated log read for the admin log viewer — newest first, keyset-paged on createdAt. */
export async function listIntegrationLogs(filter: IntegrationLogFilter): Promise<IntegrationLogEntry[]> {
  const { integration, status, limit, before } = filter;
  const rows = await sql<{
    id: string;
    integration: IntegrationKey;
    status: IntegrationLogStatus;
    event: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[]>`
    SELECT id, integration, status, event, detail, created_at
    FROM "Tombola_DB".integration_logs
    WHERE (${integration ?? null}::text IS NULL OR integration = ${integration ?? null})
      AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
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
    createdAt: row.created_at,
  }));
}
