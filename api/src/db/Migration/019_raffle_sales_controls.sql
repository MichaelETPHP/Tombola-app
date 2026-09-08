BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Sales activity is independent of lifecycle status: an inactive open raffle
-- remains public. Existing raffles retain their current purchase behavior.
ALTER TABLE "Tombola_DB".raffles
  ADD COLUMN IF NOT EXISTS sales_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Apply explicitly before deploying sample creation or sales-toggle writes.
-- The API never changes this schema automatically.
COMMIT;
