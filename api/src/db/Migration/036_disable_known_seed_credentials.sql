BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Disable only the previously distributed fixed hashes and revoke their sessions.
-- Re-enable an owner by explicitly rotating a unique password with provision-owner.ts.
UPDATE admin_users
SET password_hash = 'disabled-seed-credential',
    session_version = session_version + 1,
    updated_at = NOW()
WHERE password_hash IN (
  '$2b$10$MPDlEo8KeVtPYLHSqolhzObZ3bQbk5YANKlfbAdHi7gQeJeFE1Yey',
  '$2b$10$LXE5kJz8nX0JK3k5PJE5x.vZ8kzJ8s3k5PJE5xLXE5kJz8nX0JK3'
);

COMMIT;
