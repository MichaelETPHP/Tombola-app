import { sql } from '../client.js';

export interface DbDraw {
  id: string;
  raffleId: string;
  triggerUserId: string;
  triggerToken: string;
  triggerExpiresAt: Date;
  triggerClickedAt: Date | null;
  clientSeed: string | null;
  serverSeed: string | null;
  combinedHash: string | null;
  winnerTicketNumber: number | null;
  winnerUserId: string | null;
  status: 'pending_trigger' | 'triggered' | 'completed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a draw record with a trigger token for the selected participant.
 */
export async function createDraw(data: {
  raffleId: string;
  triggerUserId: string;
  triggerToken: string;
  triggerExpiresAt: Date;
}): Promise<DbDraw> {
  const rows = await sql<DbDraw[]>`
    INSERT INTO draws (
      raffle_id, trigger_user_id, trigger_token,
      trigger_expires_at, status
    ) VALUES (
      ${data.raffleId}, ${data.triggerUserId},
      ${data.triggerToken}, ${data.triggerExpiresAt}, 'pending_trigger'
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find a draw by trigger token.
 */
export async function findDrawByToken(token: string): Promise<DbDraw | null> {
  const rows = await sql<DbDraw[]>`
    SELECT * FROM draws WHERE trigger_token = ${token} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Find a draw by raffle ID.
 */
export async function findDrawByRaffleId(raffleId: string): Promise<DbDraw | null> {
  const rows = await sql<DbDraw[]>`
    SELECT * FROM draws
    WHERE raffle_id = ${raffleId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Record the trigger click and complete the draw.
 */
export async function completeDraw(
  id: string,
  data: {
    clientSeed: string;
    serverSeed: string;
    combinedHash: string;
    winnerTicketNumber: number;
    winnerUserId: string;
  }
): Promise<DbDraw | null> {
  const rows = await sql<DbDraw[]>`
    UPDATE draws
    SET
      trigger_clicked_at = NOW(),
      client_seed = ${data.clientSeed},
      server_seed = ${data.serverSeed},
      combined_hash = ${data.combinedHash},
      winner_ticket_number = ${data.winnerTicketNumber},
      winner_user_id = ${data.winnerUserId},
      status = 'completed',
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Mark a draw as expired (trigger link not clicked in time).
 */
export async function expireDraw(id: string): Promise<DbDraw | null> {
  const rows = await sql<DbDraw[]>`
    UPDATE draws
    SET status = 'expired', updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Find draws with expired trigger links that need re-selection.
 */
export async function findExpiredPendingDraws(): Promise<DbDraw[]> {
  return sql<DbDraw[]>`
    SELECT * FROM draws
    WHERE status = 'pending_trigger'
      AND trigger_expires_at < NOW()
  `;
}
