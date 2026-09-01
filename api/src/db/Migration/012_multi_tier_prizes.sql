-- Multi-tier prizes: a raffle can now award several ranked prizes (1st,
-- 2nd, 3rd, ...) instead of exactly one. Additive on purpose — the
-- existing raffles.prize_name/prize_value/prize_image_url columns are left
-- untouched (every current UI reads them as the raffle's headline/tier-1
-- prize) and continue to work unmodified; raffle_prizes becomes the
-- authoritative full breakdown, seeded with each raffle's existing single
-- prize as tier 1 so nothing needs a data backfill decision later.
SET search_path TO "Tombola_DB", public;

CREATE TABLE IF NOT EXISTS raffle_prizes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id   UUID NOT NULL REFERENCES raffles(id),
    tier        INTEGER NOT NULL CHECK (tier > 0),   -- 1 = grand prize, 2 = second, ...
    name        VARCHAR(255) NOT NULL,
    value       NUMERIC(12,2) NOT NULL CHECK (value > 0),
    image_url   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_raffle_prizes_tier UNIQUE (raffle_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_raffle_prizes_raffle ON raffle_prizes(raffle_id);

-- Every existing raffle's single prize becomes its tier-1 row.
INSERT INTO raffle_prizes (raffle_id, tier, name, value, image_url)
SELECT r.id, 1, r.prize_name, r.prize_value, r.prize_image_url
FROM raffles r
WHERE NOT EXISTS (SELECT 1 FROM raffle_prizes rp WHERE rp.raffle_id = r.id AND rp.tier = 1);

-- draw_results: was one row per raffle (raffle_id UNIQUE); becomes one row
-- per (raffle, tier) so a single draw can record several ranked winners.
ALTER TABLE draw_results DROP CONSTRAINT IF EXISTS draw_results_raffle_id_key;
ALTER TABLE draw_results ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1;
ALTER TABLE draw_results ADD COLUMN IF NOT EXISTS prize_id UUID REFERENCES raffle_prizes(id);

UPDATE draw_results dr
SET prize_id = rp.id
FROM raffle_prizes rp
WHERE rp.raffle_id = dr.raffle_id AND rp.tier = dr.tier AND dr.prize_id IS NULL;

ALTER TABLE draw_results ALTER COLUMN tier DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_draw_results_raffle_tier ON draw_results(raffle_id, tier);

-- payouts: was one row per raffle (raffle_id UNIQUE); becomes one row per
-- draw_result (already enforced by the existing payouts_draw_result_id_key
-- UNIQUE constraint), so up to one payout per tier per raffle.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_raffle_id_key;
CREATE INDEX IF NOT EXISTS idx_payouts_raffle ON payouts(raffle_id);
