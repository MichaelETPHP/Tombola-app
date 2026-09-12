BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Per-tier draw representatives: a second, independent role from the
-- existing draw_triggers system. A trigger's recipient is picked at RANDOM
-- from the raffle's ticket holders and clicks a link to spin the wheel; a
-- representative is hand-picked by an admin from that same ticket-holder
-- pool to witness/approve the tier before its trigger can even be
-- generated. Mirrors draw_triggers' proven shape (attempt-based rows,
-- hashed one-time token, partial unique index for "the currently active
-- row") rather than inventing a new pattern.
CREATE TYPE representative_status AS ENUM ('assigned', 'approved', 'expired');

CREATE TABLE draw_representatives (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id         UUID NOT NULL REFERENCES raffles(id),
    tier              INTEGER NOT NULL,
    prize_id          UUID REFERENCES raffle_prizes(id),
    user_id           UUID NOT NULL REFERENCES users(id),
    attempt_number    INTEGER NOT NULL DEFAULT 1,
    status            representative_status NOT NULL DEFAULT 'assigned',
    link_token        TEXT NOT NULL UNIQUE,
    assigned_by       UUID REFERENCES admin_users(id),
    assigned_reason   TEXT,
    sent_at           TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ,
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_attempt_positive CHECK (attempt_number > 0)
);

CREATE INDEX idx_draw_representatives_raffle ON draw_representatives(raffle_id);
CREATE INDEX idx_draw_representatives_token_lookup ON draw_representatives(link_token);

-- One live (assigned or already-approved) representative chain per tier —
-- reassigning expires the old row before inserting the new one, same
-- discipline as idx_draw_triggers_active_per_tier.
CREATE UNIQUE INDEX idx_draw_representatives_active_per_tier
    ON draw_representatives(raffle_id, tier)
    WHERE status IN ('assigned', 'approved');

COMMIT;
