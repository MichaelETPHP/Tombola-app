BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Four columns are the largest ticket wheel layout that stays comfortably
-- readable on the smallest supported phone. Existing purchases remain valid;
-- this only lowers the maximum for new selections.
ALTER TABLE "Tombola_DB".raffles
  DROP CONSTRAINT IF EXISTS raffles_max_tickets_per_user_check;

UPDATE "Tombola_DB".raffles
SET max_tickets_per_user = 4, updated_at = NOW()
WHERE max_tickets_per_user > 4;

ALTER TABLE "Tombola_DB".raffles
  ALTER COLUMN max_tickets_per_user SET DEFAULT 4,
  ADD CONSTRAINT raffles_max_tickets_per_user_check
    CHECK (max_tickets_per_user BETWEEN 1 AND 4);

COMMIT;
