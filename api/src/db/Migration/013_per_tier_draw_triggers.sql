-- Per-tier draw triggers: a raffle with N prize tiers now issues N
-- independent trigger links (one random participant per tier) instead of
-- a single raffle-wide link that draws every tier at once. Mirrors exactly
-- how 012 made draw_results tier-aware — same additive-plus-backfill shape,
-- same table family.
SET search_path TO "Tombola_DB", public;

ALTER TABLE draw_triggers ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1;
ALTER TABLE draw_triggers ADD COLUMN IF NOT EXISTS prize_id UUID REFERENCES raffle_prizes(id);

-- Every trigger issued so far was effectively a tier-1-style, whole-raffle
-- trigger — backfilling to tier 1 is correct, not a guess.
UPDATE draw_triggers dt
SET prize_id = rp.id
FROM raffle_prizes rp
WHERE rp.raffle_id = dt.raffle_id AND rp.tier = dt.tier AND dt.prize_id IS NULL;

ALTER TABLE draw_triggers ALTER COLUMN tier DROP DEFAULT;

-- Was: one live (pending) trigger per raffle, full stop. Now: one live
-- trigger per (raffle, tier) — each prize tier gets its own independent
-- pending link.
DROP INDEX IF EXISTS idx_draw_triggers_active_per_raffle;
CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_triggers_active_per_tier
    ON draw_triggers(raffle_id, tier)
    WHERE status = 'pending';
