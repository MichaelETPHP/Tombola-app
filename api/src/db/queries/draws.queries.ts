import { sql } from '../client.js';

export type DrawTriggerStatus = 'pending' | 'clicked' | 'expired';

/**
 * The "pull the lever" link sent to a randomly selected participant.
 * A raffle can have several of these over time (attempt_number increments)
 * if earlier ones expire unclicked.
 */
export interface DbDrawTrigger {
  id: string;
  raffleId: string;
  selectedUserId: string;
  attemptNumber: number;
  linkToken: string;
  status: DrawTriggerStatus;
  sentAt: Date;
  expiresAt: Date;
  clickedAt: Date | null;
  clickedIp: string | null;
  tokenIsHashed: boolean;
  generatedBy: string | null;
  generationReason: string | null;
  tier: number;
  prizeId: string | null;
}

/**
 * The provably-fair outcome, recorded once a trigger link is clicked.
 * Only exists after a draw_trigger exists — see draws.service.ts for why
 * the server seed is generated here rather than pre-committed earlier.
 */
export interface DbDrawResult {
  id: string;
  raffleId: string;
  drawTriggerId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  finalSeedHash: string;
  winningTicketNumber: number;
  winnerUserId: string;
  drawnAt: Date;
  createdAt: Date;
}

/**
 * Create a new trigger link for a randomly selected participant.
 */
export async function createDrawTrigger(data: {
  raffleId: string;
  selectedUserId: string;
  attemptNumber: number;
  linkToken: string;
  expiresAt: Date;
  tokenIsHashed?: boolean;
  generatedBy?: string | null;
  generationReason?: string | null;
}): Promise<DbDrawTrigger> {
  const rows = await sql<DbDrawTrigger[]>`
    INSERT INTO draw_triggers (
      raffle_id, selected_user_id, attempt_number, link_token, status, expires_at,
      token_is_hashed, generated_by, generation_reason
    ) VALUES (
      ${data.raffleId}, ${data.selectedUserId}, ${data.attemptNumber},
      ${data.linkToken}, 'pending', ${data.expiresAt}, ${data.tokenIsHashed ?? false},
      ${data.generatedBy ?? null}, ${data.generationReason ?? null}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find a trigger by its link token (the trigger-link landing page).
 */
export async function findDrawTriggerByToken(token: string): Promise<DbDrawTrigger | null> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const rows = await sql<DbDrawTrigger[]>`
    SELECT * FROM draw_triggers
    WHERE (token_is_hashed = true AND link_token = ${tokenHash})
       OR (token_is_hashed = false AND link_token = ${token})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Mark a trigger as clicked (about to be resolved into a draw result).
 */
export async function markDrawTriggerClicked(
  id: string,
  clickedIp: string | null
): Promise<DbDrawTrigger | null> {
  const rows = await sql<DbDrawTrigger[]>`
    UPDATE draw_triggers
    SET status = 'clicked', clicked_at = NOW(), clicked_ip = ${clickedIp}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Mark a trigger as expired (link not clicked in time).
 */
export async function expireDrawTrigger(id: string): Promise<DbDrawTrigger | null> {
  const rows = await sql<DbDrawTrigger[]>`
    UPDATE draw_triggers
    SET status = 'expired'
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Find pending triggers whose link has expired (need re-selection).
 */
export async function findExpiredPendingTriggers(): Promise<DbDrawTrigger[]> {
  return sql<DbDrawTrigger[]>`
    SELECT * FROM draw_triggers
    WHERE status = 'pending'
      AND expires_at < NOW()
  `;
}

/**
 * Record the provably-fair outcome once a trigger is clicked and the
 * winner is computed.
 */
export async function createDrawResult(data: {
  raffleId: string;
  drawTriggerId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  finalSeedHash: string;
  winningTicketNumber: number;
  winnerUserId: string;
}): Promise<DbDrawResult> {
  const rows = await sql<DbDrawResult[]>`
    INSERT INTO draw_results (
      raffle_id, draw_trigger_id, server_seed, server_seed_hash,
      client_seed, final_seed_hash, winning_ticket_number, winner_user_id
    ) VALUES (
      ${data.raffleId}, ${data.drawTriggerId}, ${data.serverSeed}, ${data.serverSeedHash},
      ${data.clientSeed}, ${data.finalSeedHash}, ${data.winningTicketNumber}, ${data.winnerUserId}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Find the draw result for a raffle (public verification lookup).
 */
export async function findDrawResultByRaffleId(raffleId: string): Promise<DbDrawResult | null> {
  const rows = await sql<DbDrawResult[]>`
    SELECT * FROM draw_results WHERE raffle_id = ${raffleId} LIMIT 1
  `;
  return rows[0] ?? null;
}
