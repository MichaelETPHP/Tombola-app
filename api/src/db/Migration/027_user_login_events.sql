BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- No login has ever been recorded anywhere in this platform's history — no
-- timestamps, no table, nothing (auth.service.ts's createSession only ever
-- bumped an opaque session-invalidation counter). This is real, new tracking
-- starting from whenever it ships, not a backfill of data that doesn't
-- exist — powers the admin user-detail page's "Login activity" section.
CREATE TABLE user_login_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    method      VARCHAR(20) NOT NULL,   -- 'phone_otp' | 'telegram'
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_login_events_user ON user_login_events(user_id, created_at DESC);

COMMIT;
