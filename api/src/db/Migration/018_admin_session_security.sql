SET search_path TO "Tombola_DB", public;

-- Existing admin tokens must sign in again after this migration/deployment.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
