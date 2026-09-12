BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- One row per crash the mobile app's root <svelte:boundary> ever catches.
-- Separate from integration_logs (that table's `integration` CHECK
-- constraint is scoped to outbound calls to SMS/Chapa/Telegram — a client
-- crash isn't an outbound integration call, it's the opposite direction).
-- This is what lets "which error actually shows Something went wrong" be
-- answered from the admin dashboard instead of guessed at from a bug
-- report with no console access (the Telegram Mini App has none).
CREATE TABLE "Tombola_DB".client_crash_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message             TEXT NOT NULL,
    stack               TEXT,
    url                 TEXT,
    -- 'telegram' | 'native' | 'browser' — which shell the crash happened in,
    -- so "is this Telegram-only" is a filter, not a re-investigation.
    platform            VARCHAR(20) NOT NULL DEFAULT 'browser',
    user_agent          TEXT,
    user_id             UUID,
    self_healed         BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_crash_logs_created ON "Tombola_DB".client_crash_logs(created_at DESC);
CREATE INDEX idx_client_crash_logs_platform_created ON "Tombola_DB".client_crash_logs(platform, created_at DESC);

-- Same reasoning as integration_logs: a hard cap enforced at write time
-- (see client-crash-log.ts) is enough for this platform's volume — nothing
-- here needs a scheduled job.

COMMIT;
