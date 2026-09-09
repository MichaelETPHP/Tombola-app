BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Tombola_DB".raffles
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_raffles_featured_open
  ON "Tombola_DB".raffles (created_at DESC, id DESC)
  WHERE is_featured = true AND status = 'open';
COMMIT;
