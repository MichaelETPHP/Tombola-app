import { listIntegrationLogs, type IntegrationLogStatus } from '../../lib/integration-log.js';
import { findUsersByPhones } from '../../db/queries/users.queries.js';
import { sql } from '../../db/client.js';
import { env } from '../../config/env.js';

export interface SmsLogEntry {
  id: string;
  status: IntegrationLogStatus;
  event: string;
  senderLabel: string;
  receiverPhone: string | null;
  receiverName: string | null;
  message: string | null;
  error: string | null;
  createdAt: string;
}

export interface SmsLogsPage {
  logs: SmsLogEntry[];
  nextBefore: string | null;
}

const SENDER_LABEL_FALLBACK = 'YeneEta SMS Gateway';

/**
 * Paginated, name-enriched read of the SMS slice of integration_logs for
 * the admin SMS page. The log itself only ever has a phone number (that's
 * all the gateway call used) — the receiver's registered name is resolved
 * here, at read time, via one batch lookup rather than being duplicated
 * into every log row at write time.
 */
export async function getSmsLogsPage(filter: {
  status?: IntegrationLogStatus;
  /** Scopes to one recipient — the admin user-detail page's message history. */
  phone?: string;
  limit: number;
  before?: string;
}): Promise<SmsLogsPage> {
  const rows = await listIntegrationLogs({ integration: 'sms', status: filter.status, phone: filter.phone, limit: filter.limit, before: filter.before });

  const phones = [...new Set(rows.map((row) => row.detail.to).filter((v): v is string => typeof v === 'string'))];
  const users = await findUsersByPhones(phones);
  const nameByPhone = new Map(users.map((u) => [u.phoneNumber, u.fullName]));

  const logs: SmsLogEntry[] = rows.map((row) => {
    const receiverPhone = typeof row.detail.to === 'string' ? row.detail.to : null;
    return {
      id: row.id,
      status: row.status,
      event: row.event,
      senderLabel: env.SMS_SENDER_LABEL ?? SENDER_LABEL_FALLBACK,
      receiverPhone,
      receiverName: receiverPhone ? nameByPhone.get(receiverPhone) ?? null : null,
      message: typeof row.detail.message === 'string' ? row.detail.message : null,
      error: typeof row.detail.error === 'string' ? row.detail.error : null,
      createdAt: row.createdAt,
    };
  });

  const last = logs[logs.length - 1];
  return { logs, nextBefore: logs.length === filter.limit && last ? last.createdAt : null };
}

export interface SmsStats {
  total: number;
  delivered: number;
  failed: number;
  last24h: number;
}

/** Summary counts for the SMS page's header cards. */
export async function getSmsStats(): Promise<SmsStats> {
  const [row] = await sql<{ total: string; delivered: string; failed: string; last24h: string }[]>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'success')::text AS delivered,
      COUNT(*) FILTER (WHERE status = 'error')::text AS failed,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last24h
    FROM "Tombola_DB".integration_logs
    WHERE integration = 'sms'
  `;
  return {
    total: Number(row.total),
    delivered: Number(row.delivered),
    failed: Number(row.failed),
    last24h: Number(row.last24h),
  };
}
