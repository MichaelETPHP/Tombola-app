-- Enforces one active session per user: logging in anywhere bumps this
-- counter, which is embedded in every access/refresh token minted from that
-- point on. Any token signed with an older value is rejected — the previous
-- device is effectively logged out the next time it makes a request, with
-- no separate session table or token blacklist needed.
ALTER TABLE "Tombola_DB".users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
