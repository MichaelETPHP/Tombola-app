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

/** "+251911234567" -> "+251 911***4567" — keeps the country code and a
 * few digits on each end (enough for the owner to recognize their own
 * number), masks everything else. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, '');
  const country = digits.slice(0, 4);
  const rest = digits.slice(4);
  if (rest.length <= 7) return `${country} ${rest}`;
  const prefix = rest.slice(0, 3);
  const suffix = rest.slice(-4);
  const maskedLen = Math.max(3, rest.length - 7);
  return `${country} ${prefix}${'*'.repeat(maskedLen)}${suffix}`;
}

interface PrizeTier {
  id: string;
  tier: number;
  name: string;
  value: number;
  imageUrl: string | null;
}

export async function listPrizeTiers(raffleId: string): Promise<PrizeTier[]> {
  return sql<PrizeTier[]>`
    SELECT id, tier, name, value, image_url AS "imageUrl"
    FROM raffle_prizes WHERE raffle_id = ${raffleId} ORDER BY tier ASC
  `;
}

export async function getDrawContext(token: string) {
  const trigger = await findDrawTriggerByToken(token);
  if (!trigger) throw new AppError(404, 'Invalid draw link');
  const raffle = await findRaffleById(trigger.raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const prizes = await listPrizeTiers(raffle.id);
  // The prize THIS trigger belongs to — each tier now has its own trigger
  // link, so the mobile page can say exactly which prize is being spun for
  // rather than defaulting to the raffle's headline prize.
  const ownPrize = prizes.find((p) => p.tier === trigger.tier);
  const participants = await sql<{ phone: string }[]>`
    SELECT DISTINCT u.phone_number AS phone FROM tickets t JOIN users u ON u.id = t.user_id
    WHERE t.raffle_id = ${raffle.id}
  `;
  return {
    raffleId: raffle.id,
    raffleName: raffle.title,
    raffleCode: raffle.publicCode,
    tier: trigger.tier,
    prizeName: ownPrize?.name ?? raffle.prizeName,
    prizeImageUrl: ownPrize?.imageUrl ?? raffle.prizeImageUrl,
    prizes,
    ticketCount: raffle.ticketsSold,
    registeredUsers: participants.length,
    // Masked, for the spin-reel's cycling animation — never the winner's
    // identity ahead of time, just enough plausible noise to spin through.
    participantPhones: participants.map((p) => maskPhone(p.phone)),
    drawCommitment: raffle.drawServerSeedHash,
    status: trigger.status,
    expiresAt: trigger.expiresAt,
    canSpin: trigger.status === 'pending' && trigger.expiresAt > new Date() && raffle.status === 'awaiting_trigger',
  };
}

export async function generateTriggerLink(raffleId: string, tier: number, adminId: string | null, reason: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  if (!['locked', 'awaiting_trigger'].includes(raffle.status)) {
    throw new AppError(409, 'The raffle must be locked before a draw link can be generated');
  }
  const prize = (await listPrizeTiers(raffleId)).find((p) => p.tier === tier);
  if (!prize) throw new AppError(404, `This raffle has no tier ${tier} prize configured`);

  const participants = await sql<{ userId: string }[]>`
    SELECT DISTINCT user_id FROM tickets WHERE raffle_id = ${raffleId} ORDER BY user_id
  `;
  if (participants.length === 0) throw new AppError(409, 'This raffle has no paid participants');

  // Reassigning (or auto-replacing an expired link) biases away from
  // whoever just held this exact tier's link — otherwise "pick someone
  // else" could randomly re-pick the same unresponsive person.
  const [previousHolder] = await sql<{ selectedUserId: string }[]>`
    SELECT selected_user_id AS "selectedUserId" FROM draw_triggers
    WHERE raffle_id = ${raffleId} AND tier = ${tier} ORDER BY attempt_number DESC LIMIT 1
  `;
  const isReassignment = Boolean(previousHolder);
  // Every OTHER tier's currently pending recipient is excluded too — read
  // fresh from the DB on every call (rather than passed in by the caller)
  // so this is correct no matter how "generate all tiers" orchestrates its
  // per-tier calls: each new tier link automatically avoids anyone who
  // already has a still-pending link for a different prize in this raffle.
  const otherPendingHolders = await sql<{ selectedUserId: string }[]>`
    SELECT DISTINCT selected_user_id AS "selectedUserId" FROM draw_triggers
    WHERE raffle_id = ${raffleId} AND tier != ${tier} AND status = 'pending'
  `;
  const excludeSet = new Set(otherPendingHolders.map((h) => h.selectedUserId));
  if (previousHolder) excludeSet.add(previousHolder.selectedUserId);
  // Falls back to the full pool only when there are genuinely fewer
  // participants than needed for full distinctness (e.g. 2 people, 3
  // prizes) — a raffle that small still needs its draw to proceed.
  const eligible = participants.filter((p) => !excludeSet.has(p.userId));
  const pool = eligible.length > 0 ? eligible : participants;
  const selected = pool[secureRandomIndex(pool.length)];
  const rawToken = nanoid(48);
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + TRIGGER_TTL_MS);

  const trigger = await sql.begin(async (tx) => {
    const [current] = await tx<{ drawServerSeedHash: string | null }[]>`
      SELECT draw_server_seed_hash FROM raffles WHERE id = ${raffleId} FOR UPDATE
    `;
    // Commit the provably-fair seed the FIRST time a trigger is ever
    // generated for this raffle (any tier) — not lazily at click time.
    // Publishing the hash now, before anyone (including the platform)
    // could know the ticket pool's final shape or which participants get
    // selected, is what makes the commitment actually independently
    // verifiable rather than just trusted after the fact. Stays fixed
    // across every tier and every re-attempt — only each trigger's own
    // token/recipient changes.
    if (!current.drawServerSeedHash) {
      const serverSeed = generateServerSeed();
      const serverSeedHash = await commitServerSeed(serverSeed);
      await tx`UPDATE raffles SET draw_server_seed = ${serverSeed}, draw_server_seed_hash = ${serverSeedHash} WHERE id = ${raffleId}`;
    }
    await tx`UPDATE draw_triggers SET status = 'expired' WHERE raffle_id = ${raffleId} AND tier = ${tier} AND status = 'pending'`;
    const [attempt] = await tx<{ next: number }[]>`
      SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next FROM draw_triggers WHERE raffle_id = ${raffleId} AND tier = ${tier}
    `;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO draw_triggers (
        raffle_id, tier, prize_id, selected_user_id, attempt_number, link_token, token_is_hashed,
        status, expires_at, generated_by, generation_reason
      ) VALUES (
        ${raffleId}, ${tier}, ${prize.id}, ${selected.userId}, ${attempt.next}, ${tokenHash}, true,
        'pending', ${expiresAt}, ${adminId}, ${reason}
      ) RETURNING id
    `;
    // Only flip a still-locked raffle — this runs once per tier, so it
    // must be a no-op once another tier's call has already advanced it.
    await tx`UPDATE raffles SET status = 'awaiting_trigger', updated_at = NOW() WHERE id = ${raffleId} AND status = 'locked'`;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${adminId ? 'admin' : 'system'}, ${adminId},
        ${isReassignment ? 'draw.trigger_reassigned' : 'draw.trigger_generated'}, 'raffle', ${raffleId},
        ${tx.json({ triggerId: created.id, tier, attempt: attempt.next, expiresAt: expiresAt.toISOString(), reason })}
      )
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
    tier,
    prizeName: prize.name,
    attemptNumber: trigger.attemptNumber,
    expiresAt,
    selectedParticipant: user ? { id: user.id, phone: maskPhone(user.phoneNumber) } : null,
    delivery,
    link,
  };
}

export async function executeDraw(token: string, clickedIp: string | null = null) {
  // clicked_ip is a Postgres INET column — clientIp()'s 'unknown' fallback
  // (no x-forwarded-for/x-real-ip, e.g. a direct local-dev connection with
  // no reverse proxy in front) isn't a valid inet literal and fails the
  // whole transaction. Store NULL instead; who clicked is still tracked
  // via winner_user_id regardless.
  const safeClickedIp = clickedIp && clickedIp !== 'unknown' ? clickedIp : null;
  const tokenHash = await sha256(token);
  const result = await sql.begin(async (tx) => {
    const [trigger] = await tx<{ id: string; raffleId: string; status: string; expiresAt: Date; tier: number; prizeId: string | null }[]>`
      SELECT id, raffle_id, status, expires_at, tier, prize_id AS "prizeId" FROM draw_triggers
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
      id: string; title: string; publicCode: string; status: string;
      drawServerSeed: string | null; drawServerSeedHash: string | null;
    }[]>`
      SELECT id, title, public_code, status, draw_server_seed, draw_server_seed_hash
      FROM raffles WHERE id = ${trigger.raffleId} FOR UPDATE
    `;
    if (!raffle || raffle.status !== 'awaiting_trigger') throw new AppError(409, 'This raffle is not ready to draw');

    let serverSeed = raffle.drawServerSeed;
    let serverSeedHash = raffle.drawServerSeedHash;
    if (!serverSeed || !serverSeedHash) {
      // Safety net only — generateTriggerLink commits this up front for
      // every new raffle. This covers a raffle that reached awaiting_trigger
      // before that commit-at-lock-time behavior existed.
      serverSeed = generateServerSeed();
      serverSeedHash = await commitServerSeed(serverSeed);
      await tx`UPDATE raffles SET draw_server_seed = ${serverSeed}, draw_server_seed_hash = ${serverSeedHash} WHERE id = ${raffle.id}`;
    }

    const [prize] = await tx<{ id: string; tier: number; name: string; value: number }[]>`
      SELECT id, tier, name, value FROM raffle_prizes WHERE raffle_id = ${raffle.id} AND tier = ${trigger.tier}
    `;
    if (!prize) throw new AppError(409, 'This prize tier is no longer configured');

    // Every OTHER tier's already-drawn ticket may still be in this raffle's
    // pool — tiers now resolve independently (whoever clicks their own
    // link first), not in a fixed 1,2,3 order, so "already won" has to be
    // excluded against every past draw_results row for this raffle, not
    // just tiers earlier in a loop.
    const pool = await tx<{ ticketNumber: number; userId: string }[]>`
      SELECT ticket_number, user_id FROM tickets
      WHERE raffle_id = ${raffle.id}
        AND ticket_number NOT IN (
          SELECT winning_ticket_number FROM draw_results WHERE raffle_id = ${raffle.id}
        )
      ORDER BY ticket_number
    `;
    if (pool.length === 0) throw new AppError(409, 'No tickets remain eligible for this prize tier');

    const clickedAt = new Date();
    // Derived from THIS trigger's own token + click time — each tier now
    // has its own trigger, so there's no need for a shared cross-tier seed
    // base any more; still fully deterministic and independently
    // verifiable against the raffle's one committed server seed.
    const tierClientSeed = `${clickedAt.toISOString()}:${tokenHash}:tier${trigger.tier}`;
    const { winnerIndex, combinedHash } = await computeWinner(serverSeed, tierClientSeed, pool.length);
    const winningTicket = pool[winnerIndex];

    const [draw] = await tx<{ id: string }[]>`
      INSERT INTO draw_results (
        raffle_id, draw_trigger_id, tier, prize_id, server_seed, server_seed_hash, client_seed,
        final_seed_hash, winning_ticket_number, winner_user_id
      ) VALUES (
        ${raffle.id}, ${trigger.id}, ${prize.tier}, ${prize.id}, ${serverSeed}, ${serverSeedHash}, ${tierClientSeed},
        ${combinedHash}, ${winningTicket.ticketNumber}, ${winningTicket.userId}
      ) RETURNING id
    `;

    // Integer-cents math: chk_net_value requires net_value = gross -
    // tax_withheld EXACTLY once both are rounded to NUMERIC(12,2). Doing
    // the 15% cut in floating point (e.g. 19.99 * 0.15) and rounding each
    // side separately can drift by a cent and trip that constraint.
    const grossCents = Math.round(Number(prize.value) * 100);
    const taxCents = Math.round(grossCents * 0.15);
    const taxWithheld = taxCents / 100;
    const netValue = (grossCents - taxCents) / 100;
    const claimDeadline = new Date(clickedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await tx`
      INSERT INTO payouts (
        raffle_id, draw_result_id, winner_user_id, gross_prize_value, tax_rate,
        tax_withheld, net_value, claim_deadline
      ) VALUES (
        ${raffle.id}, ${draw.id}, ${winningTicket.userId}, ${prize.value}, 15,
        ${taxWithheld}, ${netValue}, ${claimDeadline}
      )
    `;

    const [winnerUser] = await tx<{ phoneNumber: string }[]>`
      SELECT phone_number AS "phoneNumber" FROM users WHERE id = ${winningTicket.userId}
    `;
    const winnerPhone = maskPhone(winnerUser.phoneNumber);
    const winnerTicketCode = `${raffle.publicCode}-${String(winningTicket.ticketNumber).padStart(5, '0')}`;

    // Atomic check-and-set: the row is already locked by the FOR UPDATE
    // SELECT above (so a concurrent spin can't be mid-flight on the same
    // trigger), but gating the UPDATE itself on status = 'pending' and
    // verifying a row actually changed is a second, self-contained
    // guarantee against a double-spin/replay of the same token — belt and
    // suspenders rather than relying on the lock alone.
    const clicked = await tx`
      UPDATE draw_triggers SET status = 'clicked', clicked_at = ${clickedAt}, clicked_ip = ${safeClickedIp}
      WHERE id = ${trigger.id} AND status = 'pending'
    `;
    if (clicked.count === 0) throw new AppError(409, 'This draw link has already been used or replaced');

    // Only mark the raffle fully completed once every configured tier has
    // a draw_results row — other tiers' links stay independently spinnable
    // until then.
    const [{ total, drawn }] = await tx<{ total: number; drawn: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM raffle_prizes WHERE raffle_id = ${raffle.id}) AS total,
        (SELECT COUNT(*)::int FROM draw_results WHERE raffle_id = ${raffle.id}) AS drawn
    `;
    const allTiersDrawn = drawn >= total;
    if (allTiersDrawn) {
      // The raw seed is only ever revealed once every tier has concluded —
      // revealing it after the FIRST tier's spin would let anyone compute
      // every other still-pending tier's outcome in advance, since each
      // tier's client seed is derived from public/guessable inputs (its
      // own token hash + click time). The committed HASH stays public
      // throughout; only the raw seed is withheld.
      await tx`UPDATE raffles SET status = 'completed', draw_server_seed = NULL, updated_at = NOW() WHERE id = ${raffle.id}`;
    }
    const [{ total: totalTickets }] = await tx<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM tickets WHERE raffle_id = ${raffle.id}
    `;
    await tx`
      INSERT INTO audit_log (actor_type, action, entity_type, entity_id, metadata)
      VALUES ('user', 'draw.completed', 'raffle', ${raffle.id},
        ${tx.json({ triggerId: trigger.id, tier: prize.tier, winnerTicketCode, allTiersDrawn, serverSeedHash })})
    `;

    return {
      raffleId: raffle.id,
      raffleName: raffle.title,
      raffleCode: raffle.publicCode,
      tier: prize.tier,
      prizeName: prize.name,
      winnerTicketNumber: winningTicket.ticketNumber,
      winnerTicketCode,
      winnerPhone,
      totalTickets,
      // Withheld until every tier has been drawn — see comment above.
      serverSeed: allTiersDrawn ? serverSeed : null,
      clientSeed: tierClientSeed,
      combinedHash,
      serverSeedHash,
      allTiersDrawn,
      message: allTiersDrawn
        ? 'Draw completed. Every prize tier is now final.'
        : `Draw completed for this prize. Other prize tiers are still awaiting their own draw.`,
    };
  });
  logger.info(`Draw completed for raffle ${result.raffleId} tier ${result.tier}: ${result.winnerTicketCode}`);
  return result;
}

export async function getRaffleEngine(raffleId: string) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const [participants, prizes, triggers, extensions, draw] = await Promise.all([
    sql<{ id: string; fullName: string | null; phone: string; ticketCount: number; firstTicket: number; lastTicket: number; ticketNumbers: number[]; lastPurchasedAt: Date }[]>`
      SELECT u.id, u.full_name, u.phone_number AS phone, COUNT(t.id)::int AS ticket_count,
             MIN(t.ticket_number)::int AS first_ticket, MAX(t.ticket_number)::int AS last_ticket,
             ARRAY_AGG(t.ticket_number ORDER BY t.ticket_number)::int[] AS ticket_numbers,
             MAX(t.purchased_at) AS last_purchased_at
      FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.raffle_id = ${raffleId}
      GROUP BY u.id ORDER BY MIN(t.ticket_number)
    `,
    listPrizeTiers(raffleId),
    sql<{ id: string; tier: number; attemptNumber: number; status: string; sentAt: Date; expiresAt: Date; clickedAt: Date | null; phone: string }[]>`
      SELECT dt.id, dt.tier, dt.attempt_number, dt.status, dt.sent_at, dt.expires_at, dt.clicked_at, u.phone_number AS phone
      FROM draw_triggers dt JOIN users u ON u.id = dt.selected_user_id
      WHERE dt.raffle_id = ${raffleId} ORDER BY dt.tier ASC, dt.attempt_number DESC
    `,
    sql<{ id: string; previousDeadline: Date; newDeadline: Date; reason: string; extendedAt: Date; ticketsSoldAtExtension: number }[]>`
      SELECT id, previous_deadline, new_deadline, reason, extended_at, tickets_sold_at_extension
      FROM raffle_extensions WHERE raffle_id = ${raffleId} ORDER BY extended_at DESC
    `,
    sql<{ tier: number; prizeName: string; winningTicketNumber: number; winnerUserId: string; winnerName: string | null; winnerPhone: string; drawnAt: Date; finalSeedHash: string }[]>`
      SELECT dr.tier, rp.name AS prize_name, dr.winning_ticket_number, u.id AS winner_user_id, u.full_name AS winner_name, u.phone_number AS winner_phone, dr.drawn_at, dr.final_seed_hash
      FROM draw_results dr
      JOIN users u ON u.id = dr.winner_user_id
      JOIN raffle_prizes rp ON rp.id = dr.prize_id
      WHERE dr.raffle_id = ${raffleId}
      ORDER BY dr.tier ASC
    `,
  ]);
  return {
    raffle: {
      id: raffle.id, title: raffle.title, code: raffle.publicCode, status: raffle.status,
      ticketsSold: raffle.ticketsSold, ticketCap: raffle.ticketCap,
      drawCommitment: raffle.drawServerSeedHash, deadlineAt: raffle.deadlineAt,
    },
    prizes,
    participants: participants.map((participant) => ({
      ...participant,
      phone: participant.phone,
      maskedPhone: maskPhone(participant.phone),
      ticketNumbers: participant.ticketNumbers ?? [participant.firstTicket],
    })),
    // Only the latest attempt per tier — older expired/replaced attempts
    // for the same tier are audit history, not something the admin table
    // needs to render a row for.
    triggers: Object.values(
      triggers.reduce<Record<number, (typeof triggers)[number]>>((byTier, trigger) => {
        if (!byTier[trigger.tier] || trigger.attemptNumber > byTier[trigger.tier].attemptNumber) {
          byTier[trigger.tier] = trigger;
        }
        return byTier;
      }, {})
    )
      .sort((a, b) => a.tier - b.tier)
      .map((trigger) => ({
        ...trigger,
        phone: trigger.phone,
        maskedPhone: maskPhone(trigger.phone),
      })),
    extensions,
    draws: draw.map((d) => ({ ...d, winningTicketCode: `${raffle.publicCode}-${String(d.winningTicketNumber).padStart(5, '0')}` })),
  };
}
