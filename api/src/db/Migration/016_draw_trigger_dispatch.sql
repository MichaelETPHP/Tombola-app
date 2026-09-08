-- A generated draw step is only a prepared tier. The participant, token,
-- send time and expiry are assigned atomically when the owner presses Send.
SET search_path TO "Tombola_DB", public;

ALTER TABLE draw_triggers
  ALTER COLUMN selected_user_id DROP NOT NULL,
  ALTER COLUMN sent_at DROP NOT NULL,
  ALTER COLUMN sent_at DROP DEFAULT,
  ALTER COLUMN expires_at DROP NOT NULL;

DROP INDEX IF EXISTS idx_draw_triggers_active_per_tier;
CREATE UNIQUE INDEX idx_draw_triggers_active_per_tier
  ON draw_triggers(raffle_id, tier)
  WHERE status IN ('ready', 'pending');
