import { sql } from '../db/client.js';
import { logger } from './logger.js';

export type ClientCrashPlatform = 'telegram' | 'native' | 'browser';

export interface ClientCrashInput {
  message: string;
  stack?: string;
  url?: string;
  platform: ClientCrashPlatform;
  userAgent?: string;
  userId?: string;
  selfHealed: boolean;
}

const MAX_LOG_ROWS = 2000;
// Generous but bounded — a real stack trace is a few KB; this just stops a
// pathological/malicious payload from writing an unbounded row.
const MAX_TEXT_LENGTH = 8000;

function truncate(value: string | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Records one client-side crash caught by the mobile app's root error
 * boundary. Fire-and-forget by design — logging a crash report must never
 * itself throw or block the self-heal reload that's already in progress by
 * the time this is called.
 */
export function logClientCrash(input: ClientCrashInput): void {
  void (async () => {
    try {
      await sql`
        INSERT INTO "Tombola_DB".client_crash_logs
          (message, stack, url, platform, user_agent, user_id, self_healed)
        VALUES (
          ${truncate(input.message, 500) ?? 'Unknown error'},
          ${truncate(input.stack, MAX_TEXT_LENGTH)},
          ${truncate(input.url, 500)},
          ${input.platform},
          ${truncate(input.userAgent, 500)},
          ${input.userId ?? null},
          ${input.selfHealed}
        )
      `;
      if (Math.random() < 0.05) {
        await sql`
          DELETE FROM "Tombola_DB".client_crash_logs
          WHERE id NOT IN (
            SELECT id FROM "Tombola_DB".client_crash_logs
            ORDER BY created_at DESC
            LIMIT ${MAX_LOG_ROWS}
          )
        `;
      }
    } catch (error) {
      logger.error('Failed to write client crash log', error instanceof Error ? error.message : error);
    }
  })();
}

export interface ClientCrashLogEntry {
  id: string;
  message: string;
  stack: string | null;
  url: string | null;
  platform: ClientCrashPlatform;
  userAgent: string | null;
  userId: string | null;
  selfHealed: boolean;
  createdAt: string;
}

export interface ClientCrashLogFilter {
  platform?: ClientCrashPlatform;
  limit: number;
  before?: string;
}

export interface ClientCrashLogsPage {
  logs: ClientCrashLogEntry[];
  nextBefore: string | null;
}

/** Paginated log read for the admin crash-report viewer — newest first. */
export async function listClientCrashLogs(filter: ClientCrashLogFilter): Promise<ClientCrashLogsPage> {
  const { platform, limit, before } = filter;
  const rows = await sql<{
    id: string;
    message: string;
    stack: string | null;
    url: string | null;
    platform: ClientCrashPlatform;
    userAgent: string | null;
    userId: string | null;
    selfHealed: boolean;
    createdAt: string;
  }[]>`
    SELECT id, message, stack, url, platform, user_agent, user_id, self_healed, created_at
    FROM "Tombola_DB".client_crash_logs
    WHERE (${platform ?? null}::text IS NULL OR platform = ${platform ?? null})
      AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const logs = rows.map((row) => ({
    id: row.id,
    message: row.message,
    stack: row.stack,
    url: row.url,
    platform: row.platform,
    userAgent: row.userAgent,
    userId: row.userId,
    selfHealed: row.selfHealed,
    createdAt: row.createdAt,
  }));
  const last = logs[logs.length - 1];
  return { logs, nextBefore: logs.length === limit && last ? last.createdAt : null };
}

/** Header-card counts for the crash-reports page. */
export async function getClientCrashStats(): Promise<{ total: number; last24h: number; telegram: number }> {
  const [row] = await sql<{ total: string; last24h: string; telegram: string }[]>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last24h,
      COUNT(*) FILTER (WHERE platform = 'telegram')::text AS telegram
    FROM "Tombola_DB".client_crash_logs
  `;
  return { total: Number(row.total), last24h: Number(row.last24h), telegram: Number(row.telegram) };
}
