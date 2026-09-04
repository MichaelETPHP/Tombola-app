import { sql } from '../client.js';

export interface DbAuditEntry {
  id: string;
  actorType: 'user' | 'admin' | 'system';
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * List audit log entries, newest first, with optional filters. The table
 * has always been written to (every raffle/draw/payout/user mutation this
 * codebase makes logs here) — this is the first read path for it.
 */
export async function listAuditLog(options: {
  entityType?: string;
  actorType?: string;
  limit: number;
  offset: number;
}): Promise<DbAuditEntry[]> {
  const { entityType, actorType, limit, offset } = options;

  if (entityType && actorType) {
    return sql<DbAuditEntry[]>`
      SELECT * FROM audit_log
      WHERE entity_type = ${entityType} AND actor_type = ${actorType}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  if (entityType) {
    return sql<DbAuditEntry[]>`
      SELECT * FROM audit_log
      WHERE entity_type = ${entityType}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  if (actorType) {
    return sql<DbAuditEntry[]>`
      SELECT * FROM audit_log
      WHERE actor_type = ${actorType}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return sql<DbAuditEntry[]>`
    SELECT * FROM audit_log
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
