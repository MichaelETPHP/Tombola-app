import { sql } from '../db/client.js';
import { generateSecureLink, sendDrawTrigger } from '../modules/draws/draws.service.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 15_000;

// Tiers already known to be permanently unable to auto-start — a raffle
// that's locked (so it can never sell another ticket) with more prize
// tiers than unique remaining eligible participants can NEVER succeed on
// retry; without this, that tier would get hammered with an identical
// failing attempt every 15 seconds forever. There's no manual "generate
// link" button left to surface this interactively (that's the whole point
// of this job), so this is also the only thing that stops it from being
// silently invisible — see the audit_log write below.
const stuckTiers = new Set<string>();

function isPermanentlyStuck(message: string): boolean {
  return message.includes('has no paid participants') || message.includes('No eligible participants remain');
}

/**
 * Finds every prize tier that's fully cleared to start its random draw
 * trigger — its representative has approved, its raffle is locked/awaiting
 * trigger, it isn't already drawn, and it doesn't already have an active
 * (ready/pending) trigger — and starts it automatically, with no admin
 * action at all (adminId: null, same convention the expiry-reassignment
 * job below already uses). Polling rather than hooking directly into
 * approveRepresentative/executeDraw is deliberate: it retries on its own if
 * an attempt fails transiently (SMS gateway hiccup) or a tier's ordering
 * wasn't satisfied yet, and it naturally recovers after a server restart
 * with no state to reconstruct.
 */
async function startEligibleTierDraws(): Promise<void> {
  let eligible: { raffleId: string; tier: number }[];
  try {
    eligible = await sql<{ raffleId: string; tier: number }[]>`
      SELECT DISTINCT dr.raffle_id AS "raffleId", dr.tier
      FROM draw_representatives dr
      JOIN raffles r ON r.id = dr.raffle_id
      WHERE dr.status = 'approved'
        AND r.status IN ('locked', 'awaiting_trigger')
        AND NOT EXISTS (
          SELECT 1 FROM draw_triggers dt
          WHERE dt.raffle_id = dr.raffle_id AND dt.tier = dr.tier AND dt.status IN ('ready', 'pending')
        )
        AND NOT EXISTS (
          SELECT 1 FROM draw_results res WHERE res.raffle_id = dr.raffle_id AND res.tier = dr.tier
        )
    `;
  } catch (error) {
    logger.error('Auto draw-trigger check failed to load eligible tiers', error);
    return;
  }

  for (const { raffleId, tier } of eligible) {
    const key = `${raffleId}:${tier}`;
    if (stuckTiers.has(key)) continue;
    try {
      const generated = await generateSecureLink(raffleId, tier, null, 'Automatically started once the representative approved.');
      await sendDrawTrigger(raffleId, generated.triggerId, null);
      logger.info(`Auto-started draw trigger for raffle ${raffleId} tier ${tier}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isPermanentlyStuck(message)) {
        stuckTiers.add(key);
        logger.error(`Raffle ${raffleId} tier ${tier} can never auto-start: ${message} — needs manual attention (e.g. cancel the raffle).`);
        void sql`
          INSERT INTO audit_log (actor_type, action, entity_type, entity_id, metadata)
          VALUES ('system', 'draw.auto_trigger_stuck', 'raffle', ${raffleId}, ${sql.json({ tier, reason: message })})
        `.catch((logError) => logger.error('Failed to record stuck-tier audit log', logError));
      } else {
        // Not actually ready yet (e.g. tier ordering isn't satisfied) or a
        // transient failure (SMS gateway) — the next interval retries.
        logger.info(`Auto draw-trigger not ready for raffle ${raffleId} tier ${tier}: ${message}`);
      }
    }
  }
}

export function startAutoDrawTriggerCheck(): void {
  logger.info(`Starting auto draw-trigger check job (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(startEligibleTierDraws, CHECK_INTERVAL_MS);
}
