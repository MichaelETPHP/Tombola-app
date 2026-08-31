-- Production raffle-engine hardening.
SET search_path TO "Tombola_DB", public;

ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS category_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS raffle_number INTEGER,
  ADD COLUMN IF NOT EXISTS public_code VARCHAR(7),
  ADD COLUMN IF NOT EXISTS draw_server_seed TEXT,
  ADD COLUMN IF NOT EXISTS draw_server_seed_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS scheduled_draw_at TIMESTAMPTZ;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id)::int AS n FROM raffles
)
UPDATE raffles r
SET category_code = COALESCE(r.category_code, 'RAF'),
    raffle_number = COALESCE(r.raffle_number, ranked.n),
    public_code = COALESCE(r.public_code, 'RAF-' || lpad(ranked.n::text, 3, '0'))
FROM ranked
WHERE ranked.id = r.id
  AND (r.category_code IS NULL OR r.raffle_number IS NULL OR r.public_code IS NULL);

ALTER TABLE raffles
  ALTER COLUMN category_code SET NOT NULL,
  ALTER COLUMN raffle_number SET NOT NULL,
  ALTER COLUMN public_code SET NOT NULL;

ALTER TABLE raffles
  DROP CONSTRAINT IF EXISTS chk_raffle_category_code,
  ADD CONSTRAINT chk_raffle_category_code CHECK (category_code ~ '^[A-Z]{3}$'),
  DROP CONSTRAINT IF EXISTS chk_raffle_number,
  ADD CONSTRAINT chk_raffle_number CHECK (raffle_number BETWEEN 1 AND 999);

CREATE UNIQUE INDEX IF NOT EXISTS uq_raffles_public_code ON raffles(public_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_raffles_category_number ON raffles(category_code, raffle_number);

ALTER TABLE draw_triggers
  ADD COLUMN IF NOT EXISTS token_is_hashed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS generation_reason TEXT;

ALTER TABLE raffle_extensions
  ADD COLUMN IF NOT EXISTS extended_by UUID REFERENCES admin_users(id);

CREATE INDEX IF NOT EXISTS idx_draw_triggers_token_lookup ON draw_triggers(link_token);

CREATE OR REPLACE FUNCTION enforce_max_active_raffles_per_user()
RETURNS TRIGGER AS $$
DECLARE
  v_active_count INTEGER;
  v_already_participating BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM tickets WHERE user_id = NEW.user_id AND raffle_id = NEW.raffle_id
  ) INTO v_already_participating;

  IF NOT v_already_participating THEN
    SELECT COUNT(DISTINCT t.raffle_id)::int INTO v_active_count
    FROM tickets t
    JOIN raffles r ON r.id = t.raffle_id
    WHERE t.user_id = NEW.user_id
      AND r.status IN ('open', 'locked', 'awaiting_trigger', 'drawing');

    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'user % already participates in 3 active raffles', NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_max_active_raffles ON tickets;
CREATE TRIGGER trg_tickets_max_active_raffles
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION enforce_max_active_raffles_per_user();
