import { nanoid } from 'nanoid';
import { sql } from '../../db/client.js';
import { findDrawTriggerByToken, findDrawRepresentativeByToken } from '../../db/queries/draws.queries.js';
import { findRaffleById } from '../../db/queries/raffles.queries.js';
import { findUserById } from '../../db/queries/users.queries.js';
import { countUserTicketsInRaffle } from '../../db/queries/tickets.queries.js';
import { commitServerSeed, computeWinner, generateServerSeed, sha256 } from '../../lib/provably-fair.js';
import { sendDrawInvitation, sendRepresentativeInvitation } from '../../lib/sms.js';
import { ticketDisplayNumber } from '../../lib/ticket-display-number.js';
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

// 1st, 2nd, 3rd, 4th, 11th, 21st, ... — used only in error messages here.
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
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
  const [{ registeredUsers }] = await sql<{ registeredUsers: number }[]>`
    SELECT COUNT(DISTINCT user_id)::int AS "registeredUsers"
    FROM tickets WHERE raffle_id = ${raffle.id}
  `;
  let spinNonce: string | null = null;
  if (trigger.status === 'pending' && !!trigger.expiresAt && trigger.expiresAt > new Date()) {
    spinNonce = nanoid(24);
    const spinNonceHash = await sha256(spinNonce);
    await sql`
      UPDATE draw_triggers SET spin_nonce_hash = ${spinNonceHash}
      WHERE id = ${trigger.id} AND status = 'pending'
    `;
  }
  return {
    raffleId: raffle.id,
    raffleName: raffle.title,
    raffleCode: raffle.publicCode,
    tier: trigger.tier,
    prizeName: ownPrize?.name ?? raffle.prizeName,
    prizeImageUrl: ownPrize?.imageUrl ?? raffle.prizeImageUrl,
    prizes,
    ticketCount: raffle.ticketsSold,
    registeredUsers,
    // Masked, for the spin-reel's cycling animation — never the winner's
    // identity ahead of time, just enough plausible noise to spin through.
    drawDateTime: trigger.sentAt,
    drawCommitment: raffle.drawServerSeedHash,
    status: trigger.status,
    expiresAt: trigger.expiresAt,
    canSpin: trigger.status === 'pending' && !!trigger.expiresAt && trigger.expiresAt > new Date() && raffle.status === 'awaiting_trigger',
    spinNonce,
  };
}

// A tier can only be generated once the tier immediately before it has
// concluded — prizes now draw strictly in order (1st, then 2nd, then
// 3rd), never all at once and never out of sequence.
async function assertTierUnlocked(raffleId: string, tier: number): Promise<void> {
  if (tier <= 1) return;
  const [{ drawn }] = await sql<{ drawn: number }[]>`
    SELECT COUNT(*)::int AS drawn FROM draw_results WHERE raffle_id = ${raffleId} AND tier = ${tier - 1}
  `;
  if (drawn === 0) {
    throw new AppError(409, `Complete the ${ordinal(tier - 1)} prize draw before generating the ${ordinal(tier)} prize link.`);
  }
}

// A tier's random trigger link can't even be generated until its
// admin-assigned representative has approved — this is the actual gate the
// whole representative feature exists for. Distinct from assertTierUnlocked
// (which governs ordering between tiers): this governs whether THIS tier's
// witness has signed off at all.
async function assertRepresentativeApproved(raffleId: string, tier: number): Promise<void> {
  const [row] = await sql<{ status: string }[]>`
    SELECT status FROM draw_representatives
    WHERE raffle_id = ${raffleId} AND tier = ${tier} AND status = 'approved'
    LIMIT 1
  `;
  if (!row) {
    throw new AppError(409, `Assign a representative for the ${ordinal(tier)} prize and wait for their approval before generating this tier's draw link.`);
  }
}

/**
 * Picks the one participant a tier's link will go to. Excludes anyone who
 * has already won an earlier tier in this same raffle — a previous winner
 * never gets a second shot — and optionally one more specific person (the
 * outgoing holder, when this call is replacing their unused link). Never
 * falls back to re-including an excluded winner just to fill the pool:
 * an empty pool here is a real "nobody left" condition, not a hiccup to
 * paper over.
 */
async function selectEligibleParticipant(raffleId: string, excludeUserId?: string): Promise<{ userId: string }> {
  const participants = await sql<{ userId: string }[]>`
    SELECT DISTINCT user_id FROM tickets WHERE raffle_id = ${raffleId} ORDER BY user_id
  `;
  if (participants.length === 0) throw new AppError(409, 'This raffle has no paid participants');

  const previousWinners = await sql<{ winnerUserId: string }[]>`
    SELECT DISTINCT winner_user_id AS "winnerUserId" FROM draw_results WHERE raffle_id = ${raffleId}
  `;
  const excludeSet = new Set(previousWinners.map((w) => w.winnerUserId));
  if (excludeUserId) excludeSet.add(excludeUserId);

  const eligible = participants.filter((p) => !excludeSet.has(p.userId));
  if (eligible.length === 0) {
    throw new AppError(
      409,
      previousWinners.length > 0
        ? 'No eligible participants remain — everyone left in this raffle has already won an earlier prize.'
        : 'This raffle has no eligible participants.'
    );
  }
  return eligible[secureRandomIndex(eligible.length)];
}

/**
 * Step 1 of 2: creates a secure, single-use link for one prize tier and
 * randomly selects who it goes to — but does NOT send it yet. The token
 * is stored in the clear (token_is_hashed = false) for this brief
 * "generated, not yet sent" window only, so the admin can still copy the
 * link in demo/dev mode; sendDrawTrigger hashes it the moment it actually
 * goes out. Selecting the recipient here rather than at send time keeps
 * the two steps simple: send just dispatches whoever was already picked.
 */
export async function generateSecureLink(
  raffleId: string,
  tier: number,
  adminId: string | null,
  reason: string,
  opts: { excludeUserId?: string; skipActiveCheck?: boolean } = {}
) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  if (!['locked', 'awaiting_trigger'].includes(raffle.status)) {
    throw new AppError(409, 'The raffle must be locked before a draw link can be generated');
  }
  const prize = (await listPrizeTiers(raffleId)).find((p) => p.tier === tier);
  if (!prize) throw new AppError(404, `This raffle has no tier ${tier} prize configured`);
  await assertTierUnlocked(raffleId, tier);
  await assertRepresentativeApproved(raffleId, tier);

  if (!opts.skipActiveCheck) {
    const [existingActive] = await sql<{ id: string }[]>`
      SELECT id FROM draw_triggers WHERE raffle_id = ${raffleId} AND tier = ${tier} AND status IN ('ready', 'pending') LIMIT 1
    `;
    if (existingActive) throw new AppError(409, 'This tier already has an active link — send it, or reassign to replace it.');
  }

  // Prepare only; recipient selection happens atomically when Send is pressed.
  const placeholderHash = await sha256(nanoid(48));
  // Placeholder only — sendDrawTrigger overwrites this with a real TTL
  // the moment the link actually goes out. A trigger sitting unsent
  // can't be spun anyway (status isn't 'pending'), so this value is never
  // load-bearing on its own.

  const trigger = await sql.begin(async (tx) => {
    // The existingActive check above runs before this transaction opens,
    // so two concurrent calls for the same tier (a legitimate scenario now
    // that generation is automatic — see auto-draw-trigger.job.ts racing
    // trigger-expiry-check.job.ts around the moment a trigger flips from
    // 'expired' to a fresh replacement) can both pass it before either has
    // inserted. idx_draw_triggers_active_per_tier's partial unique index
    // is the actual guarantee against two active rows ever coexisting;
    // this just turns the loser's raw unique-violation into the same clean
    // AppError the pre-check already gives everyone else, instead of a
    // Postgres error code leaking out of this function.
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
    const [attempt] = await tx<{ next: number }[]>`
      SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next FROM draw_triggers WHERE raffle_id = ${raffleId} AND tier = ${tier}
    `;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO draw_triggers (
        raffle_id, tier, prize_id, selected_user_id, attempt_number, link_token, token_is_hashed,
        status, expires_at, generated_by, generation_reason
      ) VALUES (
        ${raffleId}, ${tier}, ${prize.id}, ${null}, ${attempt.next}, ${placeholderHash}, true,
        'ready', ${null}, ${adminId}, ${reason}
      ) RETURNING id
    `;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${adminId ? 'admin' : 'system'}, ${adminId}, 'draw.trigger_generated', 'raffle', ${raffleId},
        ${tx.json({ triggerId: created.id, tier, attempt: attempt.next, reason })}
      )
    `;
    return { id: created.id, attemptNumber: attempt.next };
  }).catch((error) => {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'This tier already has an active link — send it, or reassign to replace it.');
    }
    throw error;
  });

  return {
    triggerId: trigger.id,
    tier,
    prizeName: prize.name,
    attemptNumber: trigger.attemptNumber,
    status: 'ready' as const,
    selectedParticipant: null,
  };
}

/**
 * Step 2 of 2: dispatches a 'ready' trigger's link over SMS (real phone
 * number — Telegram-linked or not, everyone here already has a verified
 * Ethiopian phone number, so there's no separate delivery channel to
 * branch on) and starts its expiration clock. This is also the only
 * moment the token is ever exposed outside the DB, so it's hashed
 * immediately after being read.
 */
export async function sendDrawTrigger(
  raffleId: string,
  triggerId: string,
  adminId: string | null,
  excludeUserId?: string
) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const selected = await selectEligibleParticipant(raffleId, excludeUserId);
  const rawToken = nanoid(32);

  const dispatch = await sql.begin(async (tx) => {
    const [trigger] = await tx<{ id: string; tier: number; status: string }[]>`
      SELECT id, tier, status
      FROM draw_triggers WHERE id = ${triggerId} AND raffle_id = ${raffleId} FOR UPDATE
    `;
    if (!trigger) throw new AppError(404, 'Draw link not found');
    if (trigger.status !== 'ready') throw new AppError(409, 'This link has already been sent, used, or replaced');

    const tokenHash = await sha256(rawToken);
    const sentAt = new Date();
    const expiresAt = new Date(Date.now() + TRIGGER_TTL_MS);
    await tx`
      UPDATE draw_triggers
      SET selected_user_id = ${selected.userId}, link_token = ${tokenHash}, token_is_hashed = true,
          status = 'pending', sent_at = ${sentAt}, expires_at = ${expiresAt}
      WHERE id = ${triggerId}
    `;
    // Only flip a still-locked raffle — a no-op once an earlier tier's
    // send already advanced it.
    await tx`UPDATE raffles SET status = 'awaiting_trigger', updated_at = NOW() WHERE id = ${raffleId} AND status = 'locked'`;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId ? 'admin' : 'system'}, ${adminId}, 'draw.trigger_sent', 'raffle', ${raffleId},
        ${tx.json({ triggerId, tier: trigger.tier, expiresAt: expiresAt.toISOString() })})
    `;
    return { rawToken, tier: trigger.tier, selectedUserId: selected.userId, sentAt, expiresAt };
  });

  const user = await findUserById(dispatch.selectedUserId);
  const link = `${env.MOBILE_APP_URL}/draw/${dispatch.rawToken}`;
  let delivery: 'sent' | 'demo' | 'failed' = env.DEMO_OTP_ENABLED ? 'demo' : 'failed';
  if (user && !env.DEMO_OTP_ENABLED) {
    try {
      const prize = (await listPrizeTiers(raffleId)).find((item) => item.tier === dispatch.tier);
      const result = await sendDrawInvitation(user.phoneNumber, {
        link,
        raffleName: raffle.title,
        prizeLabel: `${ordinal(dispatch.tier)} Prize`,
        prizeName: prize?.name ?? raffle.prizeName,
        drawAt: dispatch.sentAt,
        expiresAt: dispatch.expiresAt,
      });
      delivery = result.success ? 'sent' : 'failed';
    } catch (error) {
      logger.error('Could not deliver draw trigger SMS', error);
    }
  }
  if (delivery === 'failed') {
    const safePlaceholder = await sha256(nanoid(48));
    await sql`
      UPDATE draw_triggers
      SET selected_user_id = NULL, link_token = ${safePlaceholder}, token_is_hashed = true,
          status = 'ready', sent_at = NULL, expires_at = NULL
      WHERE id = ${triggerId} AND status = 'pending'
    `;
    throw new AppError(502, 'SMS delivery failed. The link was secured and is ready to send again.');
  }
  return {
    triggerId,
    tier: dispatch.tier,
    expiresAt: dispatch.expiresAt,
    selectedParticipant: user ? { id: user.id, phone: maskPhone(user.phoneNumber) } : null,
    status: 'pending' as const,
    delivery,
    link,
  };
}

/**
 * Replaces whatever link a tier currently has (unsent, sent-but-unclicked,
 * or expired) with a fresh one for a different random participant, and
 * sends it immediately — this is the one action that still does
 * generate-and-send in a single step, since an admin reassigning an
 * unresponsive link is explicitly asking the system to act now, not to
 * pause for a second confirmation click.
 */
export async function reassignDrawTrigger(raffleId: string, tier: number, adminId: string | null, reason: string) {
  const [previousHolder] = await sql<{ selectedUserId: string | null }[]>`
    SELECT selected_user_id AS "selectedUserId" FROM draw_triggers
    WHERE raffle_id = ${raffleId} AND tier = ${tier} ORDER BY attempt_number DESC LIMIT 1
  `;
  await sql`
    UPDATE draw_triggers SET status = 'expired'
    WHERE raffle_id = ${raffleId} AND tier = ${tier} AND status IN ('ready', 'pending')
  `;
  const generated = await generateSecureLink(raffleId, tier, adminId, reason, {
    excludeUserId: previousHolder?.selectedUserId ?? undefined,
    skipActiveCheck: true,
  });
  const sent = await sendDrawTrigger(raffleId, generated.triggerId, adminId, previousHolder?.selectedUserId ?? undefined);
  await sql`
    INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES (${adminId ? 'admin' : 'system'}, ${adminId}, 'draw.trigger_reassigned', 'raffle', ${raffleId},
      ${sql.json({ triggerId: generated.triggerId, tier, reason })})
  `;
  return { ...sent, prizeName: generated.prizeName, attemptNumber: generated.attemptNumber };
}

const REPRESENTATIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — no live-event time pressure, unlike the 1h trigger window

/**
 * Assigns (or reassigns) tier N's admin-picked witness in one step — unlike
 * the trigger flow's separate generate/send, there's no reason to prepare a
 * representative link without immediately sending it. Expires whatever
 * active row that tier already has first, so at most one is ever live.
 * `userId` must already hold a ticket in this raffle — the representative
 * is picked from the raffle's own participants, never an arbitrary user.
 */
export async function assignDrawRepresentative(
  raffleId: string,
  tier: number,
  userId: string,
  adminId: string | null,
  reason: string,
  auditAction: 'draw.representative_assigned' | 'draw.representative_reassigned' = 'draw.representative_assigned'
) {
  const raffle = await findRaffleById(raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const prize = (await listPrizeTiers(raffleId)).find((p) => p.tier === tier);
  if (!prize) throw new AppError(404, `This raffle has no tier ${tier} prize configured`);

  const ticketCount = await countUserTicketsInRaffle(raffleId, userId);
  if (ticketCount === 0) throw new AppError(409, 'The representative must hold at least one ticket in this raffle.');

  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User not found');

  const rawToken = nanoid(32);
  const tokenHash = await sha256(rawToken);
  const sentAt = new Date();
  const expiresAt = new Date(Date.now() + REPRESENTATIVE_TTL_MS);

  const created = await sql.begin(async (tx) => {
    await tx`
      UPDATE draw_representatives SET status = 'expired'
      WHERE raffle_id = ${raffleId} AND tier = ${tier} AND status IN ('assigned', 'approved')
    `;
    const [attempt] = await tx<{ next: number }[]>`
      SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next FROM draw_representatives WHERE raffle_id = ${raffleId} AND tier = ${tier}
    `;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO draw_representatives (
        raffle_id, tier, prize_id, user_id, attempt_number, status, link_token,
        assigned_by, assigned_reason, sent_at, expires_at
      ) VALUES (
        ${raffleId}, ${tier}, ${prize.id}, ${userId}, ${attempt.next}, 'assigned', ${tokenHash},
        ${adminId}, ${reason}, ${sentAt}, ${expiresAt}
      ) RETURNING id
    `;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId ? 'admin' : 'system'}, ${adminId}, ${auditAction}, 'raffle', ${raffleId},
        ${tx.json({ representativeId: row.id, tier, userId, reason })})
    `;
    return { id: row.id, attemptNumber: attempt.next };
  });

  const link = `${env.MOBILE_APP_URL}/represent/${rawToken}`;
  let delivery: 'sent' | 'demo' | 'failed' = env.DEMO_OTP_ENABLED ? 'demo' : 'failed';
  if (!env.DEMO_OTP_ENABLED) {
    try {
      const result = await sendRepresentativeInvitation(user.phoneNumber, {
        link,
        raffleName: raffle.title,
        prizeLabel: `${ordinal(tier)} Prize`,
        prizeName: prize.name,
        expiresAt,
      });
      delivery = result.success ? 'sent' : 'failed';
    } catch (error) {
      logger.error('Could not deliver representative invitation SMS', error);
    }
  }
  if (delivery === 'failed') {
    await sql`UPDATE draw_representatives SET status = 'expired' WHERE id = ${created.id} AND status = 'assigned'`;
    throw new AppError(502, 'SMS delivery failed. Try assigning the representative again.');
  }

  return {
    representativeId: created.id,
    tier,
    prizeName: prize.name,
    attemptNumber: created.attemptNumber,
    status: 'assigned' as const,
    representative: { id: user.id, fullName: user.fullName, phone: maskPhone(user.phoneNumber) },
    delivery,
    link,
    expiresAt,
  };
}

/** Same operation as assignDrawRepresentative — separate name only so the
 * audit trail and admin UI copy can distinguish "first pick" from "changed
 * my mind." */
export async function reassignDrawRepresentative(raffleId: string, tier: number, userId: string, adminId: string | null, reason: string) {
  return assignDrawRepresentative(raffleId, tier, userId, adminId, reason, 'draw.representative_reassigned');
}

/** Public token lookup for the /represent/:token approval page. */
export async function getRepresentativeContext(token: string) {
  const row = await findDrawRepresentativeByToken(token);
  if (!row) throw new AppError(404, 'Invalid representative link');
  const raffle = await findRaffleById(row.raffleId);
  if (!raffle) throw new AppError(404, 'Raffle not found');
  const prize = (await listPrizeTiers(raffle.id)).find((p) => p.tier === row.tier);
  // Expiry only matters pre-approval — once approved, the row stays
  // approved regardless of what its (now-irrelevant) expiresAt says.
  const expired = row.status === 'assigned' && !!row.expiresAt && row.expiresAt <= new Date();
  return {
    raffleName: raffle.title,
    tier: row.tier,
    prizeName: prize?.name ?? raffle.prizeName,
    prizeImageUrl: prize?.imageUrl ?? raffle.prizeImageUrl,
    status: expired ? ('expired' as const) : row.status,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    canApprove: row.status === 'assigned' && !expired,
  };
}

/** Public mutation: the representative taps Approve. No spin, no nonce —
 * this is a witness signature, not a source of randomness. */
export async function approveRepresentative(token: string) {
  const tokenHash = await sha256(token);
  const result = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; raffleId: string; tier: number; userId: string; status: string; expiresAt: Date | null }[]>`
      SELECT id, raffle_id, tier, user_id, status, expires_at FROM draw_representatives
      WHERE link_token = ${tokenHash} FOR UPDATE
    `;
    if (!row) throw new AppError(404, 'Invalid representative link');
    if (row.status === 'approved') throw new AppError(409, 'This has already been approved.');
    if (row.status !== 'assigned') throw new AppError(409, 'This link is no longer active.');
    if (row.expiresAt && row.expiresAt <= new Date()) {
      await tx`UPDATE draw_representatives SET status = 'expired' WHERE id = ${row.id}`;
      throw new AppError(410, 'This approval link has expired.');
    }
    await tx`UPDATE draw_representatives SET status = 'approved', approved_at = NOW() WHERE id = ${row.id}`;
    await tx`
      INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES ('user', ${row.userId}, 'draw.representative_approved', 'raffle', ${row.raffleId},
        ${tx.json({ representativeId: row.id, tier: row.tier })})
    `;
    return { tier: row.tier };
  });
  return { status: 'approved' as const, tier: result.tier };
}

export async function executeDraw(token: string, spinNonce: string, clickedIp: string | null = null) {
  // clicked_ip is a Postgres INET column — clientIp()'s 'unknown' fallback
  // (no x-forwarded-for/x-real-ip, e.g. a direct local-dev connection with
  // no reverse proxy in front) isn't a valid inet literal and fails the
  // whole transaction. Store NULL instead; who clicked is still tracked
  // via winner_user_id regardless.
  const safeClickedIp = clickedIp && clickedIp !== 'unknown' ? clickedIp : null;
  const tokenHash = await sha256(token);
  const spinNonceHash = await sha256(spinNonce);
  const result = await sql.begin(async (tx) => {
    const [trigger] = await tx<{ id: string; raffleId: string; status: string; expiresAt: Date; tier: number; prizeId: string | null }[]>`
      SELECT id, raffle_id, status, expires_at, tier, prize_id AS "prizeId" FROM draw_triggers
      WHERE ((token_is_hashed = true AND link_token = ${tokenHash})
         OR (token_is_hashed = false AND link_token = ${token}))
        AND spin_nonce_hash = ${spinNonceHash}
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
      drawServerSeed: string | null; drawServerSeedHash: string | null; numberSeed: number | null;
    }[]>`
      SELECT id, title, public_code, status, draw_server_seed, draw_server_seed_hash, number_seed
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
    if (prize.tier > 1) {
      const [{ drawn }] = await tx<{ drawn: number }[]>`
        SELECT COUNT(*)::int AS drawn FROM draw_results
        WHERE raffle_id = ${raffle.id} AND tier = ${prize.tier - 1}
      `;
      if (drawn === 0) throw new AppError(409, `The ${ordinal(prize.tier - 1)} prize must finish first`);
    }

    // Every OTHER tier's already-drawn ticket may still be in this raffle's
    // pool — tiers now resolve independently (whoever clicks their own
    // link first), not in a fixed 1,2,3 order, so "already won" has to be
    // excluded against every past draw_results row for this raffle, not
    // just tiers earlier in a loop.
    const pool = await tx<{ ticketNumber: number; userId: string }[]>`
      SELECT ticket_number, user_id FROM tickets
      WHERE raffle_id = ${raffle.id}
        AND user_id NOT IN (
          SELECT winner_user_id FROM draw_results WHERE raffle_id = ${raffle.id}
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

    const winnerTicketCode = `${raffle.publicCode}-${ticketDisplayNumber(raffle.numberSeed, winningTicket.ticketNumber)}`;

    // Atomic check-and-set: the row is already locked by the FOR UPDATE
    // SELECT above (so a concurrent spin can't be mid-flight on the same
    // trigger), but gating the UPDATE itself on status = 'pending' and
    // verifying a row actually changed is a second, self-contained
    // guarantee against a double-spin/replay of the same token — belt and
    // suspenders rather than relying on the lock alone.
    const clicked = await tx`
      UPDATE draw_triggers SET status = 'clicked', clicked_at = ${clickedAt}, clicked_ip = ${safeClickedIp}, spin_nonce_hash = NULL
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
  const [participants, prizes, triggers, representatives, extensions, draw] = await Promise.all([
    sql<{ id: string; fullName: string | null; phone: string; ticketCount: number; firstTicket: number; lastTicket: number; ticketNumbers: number[]; lastPurchasedAt: Date }[]>`
      SELECT u.id, u.full_name, u.phone_number AS phone, COUNT(t.id)::int AS ticket_count,
             MIN(t.ticket_number)::int AS first_ticket, MAX(t.ticket_number)::int AS last_ticket,
             ARRAY_AGG(t.ticket_number ORDER BY t.ticket_number)::int[] AS ticket_numbers,
             MAX(t.purchased_at) AS last_purchased_at
      FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.raffle_id = ${raffleId}
      GROUP BY u.id ORDER BY MIN(t.ticket_number)
    `,
    listPrizeTiers(raffleId),
    sql<{ id: string; tier: number; attemptNumber: number; status: string; sentAt: Date | null; expiresAt: Date | null; clickedAt: Date | null; phone: string | null }[]>`
      SELECT dt.id, dt.tier, dt.attempt_number, dt.status, dt.sent_at, dt.expires_at, dt.clicked_at, u.phone_number AS phone
      FROM draw_triggers dt LEFT JOIN users u ON u.id = dt.selected_user_id
      WHERE dt.raffle_id = ${raffleId} ORDER BY dt.tier ASC, dt.attempt_number DESC
    `,
    sql<{ id: string; tier: number; attemptNumber: number; status: string; sentAt: Date | null; expiresAt: Date | null; approvedAt: Date | null; userId: string; fullName: string | null; phone: string }[]>`
      SELECT dr.id, dr.tier, dr.attempt_number, dr.status, dr.sent_at, dr.expires_at, dr.approved_at,
             u.id AS user_id, u.full_name, u.phone_number AS phone
      FROM draw_representatives dr JOIN users u ON u.id = dr.user_id
      WHERE dr.raffle_id = ${raffleId} ORDER BY dr.tier ASC, dr.attempt_number DESC
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
        maskedPhone: trigger.phone ? maskPhone(trigger.phone) : null,
      })),
    // Only the latest attempt per tier, same reasoning as triggers above.
    representatives: Object.values(
      representatives.reduce<Record<number, (typeof representatives)[number]>>((byTier, rep) => {
        if (!byTier[rep.tier] || rep.attemptNumber > byTier[rep.tier].attemptNumber) {
          byTier[rep.tier] = rep;
        }
        return byTier;
      }, {})
    )
      .sort((a, b) => a.tier - b.tier)
      .map((rep) => ({ ...rep, maskedPhone: maskPhone(rep.phone) })),
    extensions,
    draws: draw.map((d) => ({ ...d, winningTicketCode: `${raffle.publicCode}-${ticketDisplayNumber(raffle.numberSeed, d.winningTicketNumber)}` })),
  };
}
