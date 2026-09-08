BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Existing admin tokens must sign in again after this migration/deployment.
ALTER TABLE "Tombola_DB".admin_users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

COMMIT;
