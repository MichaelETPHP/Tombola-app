import { sql } from '../db/client.js';
import { logger } from './logger.js';

export type LoginMethod = 'phone_otp' | 'telegram';

const MAX_LOG_ROWS_PER_USER_TABLE = 20_000;

/**
 * Records one successful login. Fire-and-forget by design, same reasoning as
 * logIntegrationEvent/logClientCrash — a failure to log a login must never
 * fail the login itself. There was no login history of any kind before this
 * (no timestamps, no table) — this only starts filling in from the moment
 * it ships; nothing to backfill.
 */
export function recordLoginEvent(
  userId: string,
  method: LoginMethod,
  ip: string | null,
  userAgent: string | null
): void {
  void (async () => {
    try {
      await sql`
        INSERT INTO user_login_events (user_id, event_type, method, ip_address, user_agent)
        VALUES (${userId}, 'login', ${method}, ${ip}, ${userAgent})
      `;
      await trimOldEvents();
    } catch (error) {
      logger.error('Failed to record login event', error instanceof Error ? error.message : error);
    }
  })();
}

/**
 * Records one logout — same fire-and-forget reasoning as recordLoginEvent.
 * No `method` (there's no such thing as a "logout method"); it exists so
 * the user-detail page can show a real session timeline instead of just a
 * list of arrivals.
 */
export function recordLogoutEvent(userId: string): void {
  void (async () => {
    try {
      await sql`
        INSERT INTO user_login_events (user_id, event_type)
        VALUES (${userId}, 'logout')
      `;
      await trimOldEvents();
    } catch (error) {
      logger.error('Failed to record logout event', error instanceof Error ? error.message : error);
    }
  })();
}

async function trimOldEvents(): Promise<void> {
  if (Math.random() >= 0.02) return;
  await sql`
    DELETE FROM user_login_events
    WHERE id NOT IN (
      SELECT id FROM user_login_events ORDER BY created_at DESC LIMIT ${MAX_LOG_ROWS_PER_USER_TABLE}
    )
  `;
}

export interface LoginEventEntry {
  id: string;
  eventType: 'login' | 'logout';
  method: LoginMethod | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface LoginEventsPage {
  events: LoginEventEntry[];
  nextBefore: string | null;
}

/** Paginated read for the admin user-detail page's login activity section. */
export async function listLoginEvents(userId: string, limit: number, before?: string): Promise<LoginEventsPage> {
  const rows = await sql<LoginEventEntry[]>`
    SELECT id, event_type AS "eventType", method, ip_address AS "ipAddress", user_agent AS "userAgent", created_at AS "createdAt"
    FROM user_login_events
    WHERE user_id = ${userId}
      AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const last = rows[rows.length - 1];
  return { events: rows, nextBefore: rows.length === limit && last ? last.createdAt : null };
}

/** Most recent login timestamp for a user, for the detail page's header stat. */
export async function findLastLoginAt(userId: string): Promise<string | null> {
  const [row] = await sql<{ createdAt: string | null }[]>`
    SELECT MAX(created_at) AS "createdAt" FROM user_login_events WHERE user_id = ${userId} AND event_type = 'login'
  `;
  return row?.createdAt ?? null;
}
