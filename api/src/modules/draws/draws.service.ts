import { nanoid } from 'nanoid';
import { sql } from '../../db/client.js';
import { findDrawTriggerByToken } from '../../db/queries/draws.queries.js';
import { findRaffleById } from '../../db/queries/raffles.queries.js';
import { findUserById } from '../../db/queries/users.queries.js';
import { commitServerSeed, computeWinner, generateServerSeed, sha256 } from '../../lib/provably-fair.js';
import { sendTriggerLink } from '../../lib/sms.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

const TRIGGER_TTL_MS = 60 * 60 * 1000;

function secureRandomIndex(length: number): number {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error('Selection pool is empty');
  const limit = Math.floor(0x1_0000_0000 / length) * length;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % length;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}`;
}

export async function getDrawContext(token: string) {
  const trigger = await findDrawTriggerByToken(token);
  if (!trigger) throw new AppError(404, 'Invalid draw link');
  const raffle = await findRaffleById(trigger.raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  return {
    raffleId: raffle.id,
    raffleName: raffle.title,
    raffleCode: raffle.publicCode,
    prizeName: raffle.prizeName,
    prizeImageUrl: raffle.prizeImageUrl,
    ticketCount: raffle.ticketsSold,
    drawCommitment: raffle.drawServerSeedHash,
    status: trigger.status,
    expiresAt: trigger.expiresAt,
    canSpin: trigger.status === 'pending' && trigger.expiresAt > new Date() && raffle.status === 'awaiting_trigger',
  };
}

export async function generateTriggerLink(raffleId: string, adminId: string | null, reason: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  if (!['locked', 'awaiting_trigger'].includes(raffle.status)) {
    throw new AppError(409, 'The raffle must be locked before a draw link can be generated');
  }
  const participants = await sql<{ userId: string }[]>`
    SELECT DISTINCT user_id FROM tickets WHERE raffle_id = ${raffleId} ORDER BY user_id
  `;
  if (participants.length === 0) throw new AppError(409, 'This raffle has no paid participants');

  const selected = participants[secureRandomIndex(participants.length)];
  const rawToken = nanoid(48);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + TRIGGER_TTL_MS);

  const trigger = await sql.begin(async (tx) => {
    await tx`SELECT id FROM raffles WHERE id = ${raffleId} FOR UPDATE`;
    await tx`UPDATE draw_triggers SET status = 'expired' WHERE raffle_id = ${raffleId} AND status = 'pending'`;
    const [attempt] = await tx<{ next: number }[]>`
      SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next FROM draw_triggers WHERE raffle_id = ${raffleId}
    `;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO draw_triggers (
        raffle_id, selected_user_id, attempt_number, link_token, token_is_hashed,
        status, expires_at, generated_by, generation_reason
      ) VALUES (
        ${raffleId}, ${selected.userId}, ${attempt.next}, ${tokenHash}, true,
        'pending', ${expiresAt}, ${adminId}, ${reason}
      ) RETURNING id
    `;
    await tx`UPDATE raffles SET status = 'awaiting_trigger', updated_at = NOW() WHERE id = ${raffleId}`;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId ? 'admin' : 'system'}, ${adminId}, 'draw.trigger_generated', 'raffle', ${raffleId},
        ${tx.json({ triggerId: created.id, attempt: attempt.next, expiresAt: expiresAt.toISOString(), reason })})
    `;
    return { id: created.id, attemptNumber: attempt.next };
  });

  const user = await findUserById(selected.userId);
  const link = `${env.MOBILE_APP_URL}/draw/${rawToken}`;
  let delivery: 'sent' | 'demo' | 'failed' = env.DEMO_OTP_ENABLED ? 'demo' : 'failed';
  if (user && !env.DEMO_OTP_ENABLED) {
    try {
      const result = await sendTriggerLink(user.phoneNumber, link);
      delivery = result.success ? 'sent' : 'failed';
    } catch (error) {
      logger.error('Could not deliver draw trigger SMS', error);
    }
  }
  return {
    triggerId: trigger.id,
    attemptNumber: trigger.attemptNumber,
    expiresAt,
    selectedParticipant: user ? { id: user.id, phone: maskPhone(user.phoneNumber) } : null,
    delivery,
    link,
  };
}

export async function executeDraw(token: string, clickedIp: string | null = null) {
  const tokenHash = await sha256(token);
  const result = await sql.begin(async (tx) => {
    const [trigger] = await tx<{ id: string; raffleId: string; status: string; expiresAt: Date }[]>`
      SELECT id, raffle_id, status, expires_at FROM draw_triggers
      WHERE (token_is_hashed = true AND link_token = ${tokenHash})
         OR (token_is_hashed = false AND link_token = ${token})
      FOR UPDATE
    `;
    if (!trigger) throw new AppError(404, 'Invalid draw link');
    if (trigger.status !== 'pending') throw new AppError(409, 'This draw link has already been used or replaced');
    if (trigger.expiresAt <= new Date()) {
      await tx`UPDATE draw_triggers SET status = 'expired' WHERE id = ${trigger.id}`;
      throw new AppError(410, 'This draw link has expired');
    }
    const [raffle] = await tx<{
      id: string; title: string; publicCode: string; prizeValue: number; status: string;
      drawServerSeed: string | null; drawServerSeedHash: string | null;
    }[]>`
      SELECT id, title, public_code, prize_value, status, draw_server_seed, draw_server_seed_hash
      FROM raffles WHERE id = ${trigger.raffleId} FOR UPDATE
    `;
    if (!raffle || raffle.status !== 'awaiting_trigger') throw new AppError(409, 'This raffle is not ready to draw');

    let serverSeed = raffle.drawServerSeed;
    let serverSeedHash = raffle.drawServerSeedHash;
    if (!serverSeed || !serverSeedHash) {
      serverSeed = generateServerSeed();
      serverSeedHash = await commitServerSeed(serverSeed);
      await tx`UPDATE raffles SET draw_server_seed = ${serverSeed}, draw_server_seed_hash = ${serverSeedHash} WHERE id = ${raffle.id}`;
    }
    const tickets = await tx<{ ticketNumber: number; userId: string }[]>`
      SELECT ticket_number, user_id FROM tickets WHERE raffle_id = ${raffle.id} ORDER BY ticket_number
    `;
    if (tickets.length === 0) throw new AppError(409, 'This raffle has no tickets');

    const clickedAt = new Date();
    const clientSeed = `${clickedAt.toISOString()}:${tokenHash}`;
    const { winnerIndex, combinedHash } = await computeWinner(serverSeed, clientSeed, tickets.length);
    const winningTicket = tickets[winnerIndex];
    const [draw] = await tx<{ id: string }[]>`
      INSERT INTO draw_results (
        raffle_id, draw_trigger_id, server_seed, server_seed_hash, client_seed,
        final_seed_hash, winning_ticket_number, winner_user_id
      ) VALUES (
        ${raffle.id}, ${trigger.id}, ${serverSeed}, ${serverSeedHash}, ${clientSeed},
        ${combinedHash}, ${winningTicket.ticketNumber}, ${winningTicket.userId}
      ) RETURNING id
    `;
    await tx`UPDATE draw_triggers SET status = 'clicked', clicked_at = ${clickedAt}, clicked_ip = ${clickedIp} WHERE id = ${trigger.id}`;
    await tx`UPDATE raffles SET status = 'completed', draw_server_seed = NULL, updated_at = NOW() WHERE id = ${raffle.id}`;
    const claimDeadline = new Date(clickedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const taxWithheld = Number(raffle.prizeValue) * 0.15;
    await tx`
      INSERT INTO payouts (
        raffle_id, draw_result_id, winner_user_id, gross_prize_value, tax_rate,
        tax_withheld, net_value, claim_deadline
      ) VALUES (
        ${raffle.id}, ${draw.id}, ${winningTicket.userId}, ${raffle.prizeValue}, 15,
        ${taxWithheld}, ${Number(raffle.prizeValue) - taxWithheld}, ${claimDeadline}
      )
    `;
    await tx`
      INSERT INTO audit_log (actor_type, action, entity_type, entity_id, metadata)
      VALUES ('user', 'draw.completed', 'raffle', ${raffle.id},
        ${tx.json({ triggerId: trigger.id, winningTicketNumber: winningTicket.ticketNumber, finalSeedHash: combinedHash })})
    `;
    return {
      raffleId: raffle.id,
      raffleName: raffle.title,
      raffleCode: raffle.publicCode,
      winnerTicketNumber: winningTicket.ticketNumber,
      winnerTicketCode: `${raffle.publicCode}-${String(winningTicket.ticketNumber).padStart(5, '0')}`,
      totalTickets: tickets.length,
      serverSeed,
      clientSeed,
      combinedHash,
      serverSeedHash,
      message: 'Draw completed. The winning ticket is now final.',
    };
  });
  logger.info(`Draw completed for raffle ${result.raffleId}: ${result.winnerTicketCode}`);
  return result;
}

export async function getRaffleEngine(raffleId: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const [participants, triggers, extensions, draw] = await Promise.all([
    sql<{ id: string; fullName: string | null; phone: string; ticketCount: number; firstTicket: number; lastTicket: number }[]>`
      SELECT u.id, u.full_name, u.phone_number AS phone, COUNT(t.id)::int AS ticket_count,
             MIN(t.ticket_number)::int AS first_ticket, MAX(t.ticket_number)::int AS last_ticket
      FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.raffle_id = ${raffleId}
      GROUP BY u.id ORDER BY MIN(t.ticket_number)
    `,
    sql<{ id: string; attemptNumber: number; status: string; sentAt: Date; expiresAt: Date; clickedAt: Date | null; phone: string }[]>`
      SELECT dt.id, dt.attempt_number, dt.status, dt.sent_at, dt.expires_at, dt.clicked_at, u.phone_number AS phone
      FROM draw_triggers dt JOIN users u ON u.id = dt.selected_user_id
      WHERE dt.raffle_id = ${raffleId} ORDER BY dt.attempt_number DESC
    `,
    sql<{ id: string; previousDeadline: Date; newDeadline: Date; reason: string; extendedAt: Date; ticketsSoldAtExtension: number }[]>`
      SELECT id, previous_deadline, new_deadline, reason, extended_at, tickets_sold_at_extension
      FROM raffle_extensions WHERE raffle_id = ${raffleId} ORDER BY extended_at DESC
    `,
    sql<{ winningTicketNumber: number; winnerName: string | null; drawnAt: Date; finalSeedHash: string }[]>`
      SELECT dr.winning_ticket_number, u.full_name AS winner_name, dr.drawn_at, dr.final_seed_hash
      FROM draw_results dr JOIN users u ON u.id = dr.winner_user_id WHERE dr.raffle_id = ${raffleId}
    `,
  ]);
  return {
    raffle: {
      id: raffle.id, title: raffle.title, code: raffle.publicCode, status: raffle.status,
      ticketsSold: raffle.ticketsSold, ticketCap: raffle.ticketCap,
      drawCommitment: raffle.drawServerSeedHash, deadlineAt: raffle.deadlineAt,
    },
    participants: participants.map((participant) => ({ ...participant, phone: maskPhone(participant.phone) })),
    triggers: triggers.map((trigger) => ({ ...trigger, phone: maskPhone(trigger.phone) })),
    extensions,
    draw: draw[0] ? { ...draw[0], winningTicketCode: `${raffle.publicCode}-${String(draw[0].winningTicketNumber).padStart(5, '0')}` } : null,
  };
}
