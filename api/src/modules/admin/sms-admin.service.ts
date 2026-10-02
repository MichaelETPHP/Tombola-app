import { listIntegrationLogs, type IntegrationLogStatus } from '../../lib/integration-log.js';
import { findUsersByPhones } from '../../db/queries/users.queries.js';
import { sql } from '../../db/client.js';

export interface SmsLogEntry {
  id: string;
  status: IntegrationLogStatus;
  event: string;
  senderLabel: string;
  receiverPhone: string | null;
  receiverName: string | null;
  message: string | null;
  error: string | null;
  /**
   * The gateway's own delivery state ("Processing", "Sent", "Delivered",
   * "Failed") for a `delivery_status` row — the sms-delivery-check job's
   * reconciliation sweep, not the initial send. Null for every other event,
   * since those only ever reflect the gateway *accepting* the message, not
   * what happened to it afterwards.
   */
  deliveryState: string | null;
  createdAt: string;
}

export interface SmsLogsPage {
  logs: SmsLogEntry[];
  nextBefore: string | null;
}

// Fixed, not environment-configurable: this app only ever has one real SMS
// identity ("251 Lottery"), and a per-environment override is exactly what
// let a stale "YeneEta" default survive in dev's compose file after the
// rebrand. One hardcoded value here can't drift the way an env var can.
const SENDER_LABEL = '251 Lottery';

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
      senderLabel: SENDER_LABEL,
      receiverPhone,
      receiverName: receiverPhone ? nameByPhone.get(receiverPhone) ?? null : null,
      message: typeof row.detail.message === 'string' ? row.detail.message : null,
      error: typeof row.detail.error === 'string' ? row.detail.error : null,
      deliveryState: typeof row.detail.state === 'string' ? row.detail.state : null,
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

/**
 * Summary counts for the SMS page's header cards — one row per message,
 * since recordSmsDeliveryState() (see sms-delivery-check.job.ts) updates a
 * message's own send-time row in place rather than inserting new ones.
 * `event != 'delivery_status'` stays as a defensive filter against the
 * handful of old rows an earlier version of that job inserted separately,
 * which would otherwise double-count a settled message here.
 */
export async function getSmsStats(): Promise<SmsStats> {
  const [row] = await sql<{ total: string; delivered: string; failed: string; last24h: string }[]>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'success')::text AS delivered,
      COUNT(*) FILTER (WHERE status = 'error')::text AS failed,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last24h
    FROM "Tombola_DB".integration_logs
    WHERE integration = 'sms' AND event != 'delivery_status'
  `;
  return {
    total: Number(row.total),
    delivered: Number(row.delivered),
    failed: Number(row.failed),
    last24h: Number(row.last24h),
  };
}
