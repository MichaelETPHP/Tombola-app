BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Every outbound call to an external integration (SMS gateway, Chapa) gets
-- one row here, success or failure — this is what backs the admin
-- Integrations page's live status and log viewer. Deliberately its own
-- table rather than reusing the app's structured stdout logger: a crashed
-- or restarted API loses whatever was only in its log stream, but this
-- survives exactly that (the case admins most want it for), and it's
-- queryable/filterable in a way grepping container logs isn't.
CREATE TABLE "Tombola_DB".integration_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration         VARCHAR(20) NOT NULL CHECK (integration IN ('sms', 'chapa', 'telegram')),
    status              VARCHAR(10) NOT NULL CHECK (status IN ('success', 'error')),
    event               VARCHAR(60) NOT NULL,
    -- Free-form context (recipient, tx_ref, gateway message id, error
    -- detail) — shaped differently per integration/event, so jsonb rather
    -- than a fixed set of nullable columns that would mostly stay empty.
    detail              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The log viewer's one query: latest N, optionally filtered by integration
-- and/or status.
CREATE INDEX idx_integration_logs_created ON "Tombola_DB".integration_logs(created_at DESC);
CREATE INDEX idx_integration_logs_integration_created ON "Tombola_DB".integration_logs(integration, created_at DESC);

-- Unbounded log growth on a small raffle platform is a slow leak, not an
-- emergency — a hard cap enforced at write time (see integration-log.ts)
-- is enough; nothing here runs on a schedule.

COMMIT;
