-- ============================================================================
-- TOMBOLA / RAFFLE PLATFORM — DATABASE SCHEMA
-- PostgreSQL 14+
-- Stack: Hono (Bun) API layer, this schema is DB-of-record
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SCHEMA
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS "Tombola_DB";

-- Every unqualified object below (tables, types, functions, views) is
-- created in "Tombola_DB" because of this — the API's connection (see
-- api/src/db/client.ts) sets the same search_path so its queries resolve
-- against this schema instead of the default `public` one.
SET search_path TO "Tombola_DB", public;

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE user_status            AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE admin_role             AS ENUM ('owner', 'moderator');
CREATE TYPE otp_purpose            AS ENUM ('signup', 'login', 'claim_verification');

CREATE TYPE raffle_status          AS ENUM (
    'draft',            -- created by admin, not yet visible
    'open',              -- accepting ticket purchases
    'locked',             -- cap reached, awaiting trigger selection
    'awaiting_trigger',    -- trigger link sent, waiting for click
    'drawing',              -- draw in progress (transient)
    'completed',             -- winner determined
    'cancelled'                -- pulled by admin before completion
);

CREATE TYPE payment_gateway        AS ENUM ('chapa', 'telebirr', 'manual');
CREATE TYPE payment_status         AS ENUM ('pending', 'completed', 'failed', 'refunded');

CREATE TYPE trigger_status         AS ENUM ('pending', 'clicked', 'expired');

CREATE TYPE claim_status           AS ENUM (
    'pending_claim', 'id_submitted', 'verified', 'rejected', 'fulfilled', 'expired'
);
CREATE TYPE delivery_method        AS ENUM ('pickup', 'delivery');
CREATE TYPE fulfillment_status     AS ENUM ('processing', 'shipped', 'delivered', 'failed');

CREATE TYPE notification_type      AS ENUM (
    'otp', 'raffle_extended', 'raffle_locked', 'trigger_selected',
    'draw_result_win', 'draw_result_loss', 'claim_reminder', 'payout_fulfilled'
);
CREATE TYPE notification_status    AS ENUM ('sent', 'failed', 'delivered');
CREATE TYPE actor_type             AS ENUM ('admin', 'system', 'user');

-- ----------------------------------------------------------------------------
-- SHARED TRIGGER FUNCTION: auto-update updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. USERS
-- ============================================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number        VARCHAR(20)  NOT NULL UNIQUE,   -- E.164 format e.g. +2519XXXXXXXX
    phone_verified_at   TIMESTAMPTZ,
    full_name           VARCHAR(255),                   -- filled at claim time, nullable at signup
    preferred_language  VARCHAR(5) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'am')),
    status              user_status  NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT phone_number_format CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================================
-- 2. ADMIN USERS (platform owner / moderators)
-- ============================================================================
CREATE TABLE admin_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number        VARCHAR(20) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    role                admin_role NOT NULL DEFAULT 'moderator',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. OTP CODES (signup / login / claim verification)
-- ============================================================================
CREATE TABLE otp_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number        VARCHAR(20) NOT NULL,           -- not FK: user may not exist yet at signup
    code_hash           TEXT NOT NULL,                  -- never store plaintext OTP
    purpose             otp_purpose NOT NULL,
    attempts             SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 5,
    expires_at          TIMESTAMPTZ NOT NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_attempts CHECK (attempts <= max_attempts)
);

CREATE INDEX idx_otp_phone_purpose ON otp_codes(phone_number, purpose);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);

-- ============================================================================
-- 4. RAFFLES
-- ============================================================================
CREATE TABLE raffles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                   VARCHAR(255) NOT NULL,
    description             TEXT,
    prize_name              VARCHAR(255) NOT NULL,
    prize_value             NUMERIC(12,2) NOT NULL CHECK (prize_value > 0),
    prize_image_url         TEXT,

    ticket_price            NUMERIC(10,2) NOT NULL CHECK (ticket_price > 0),
    ticket_cap              INTEGER NOT NULL CHECK (ticket_cap > 0),
    max_tickets_per_user    INTEGER NOT NULL DEFAULT 5 CHECK (max_tickets_per_user BETWEEN 1 AND 5),

    deadline_days           INTEGER NOT NULL CHECK (deadline_days > 0),
    extension_days          INTEGER NOT NULL DEFAULT 0,   -- 0 = reuse deadline_days on extend

    opens_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at             TIMESTAMPTZ NOT NULL,

    status                  raffle_status NOT NULL DEFAULT 'draft',

    created_by              UUID NOT NULL REFERENCES admin_users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_max_tickets_not_exceed_cap CHECK (max_tickets_per_user <= ticket_cap)
);

CREATE TRIGGER trg_raffles_updated_at
    BEFORE UPDATE ON raffles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_raffles_status ON raffles(status);
CREATE INDEX idx_raffles_deadline ON raffles(deadline_at);

-- ----------------------------------------------------------------------------
-- 4a. RAFFLE EXTENSIONS — audit trail of every deadline extension
-- ----------------------------------------------------------------------------
CREATE TABLE raffle_extensions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id           UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
    previous_deadline   TIMESTAMPTZ NOT NULL,
    new_deadline        TIMESTAMPTZ NOT NULL,
    tickets_sold_at_extension INTEGER NOT NULL,
    reason              TEXT NOT NULL DEFAULT 'cap not reached by deadline',
    extended_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_new_after_previous CHECK (new_deadline > previous_deadline)
);

CREATE INDEX idx_raffle_extensions_raffle ON raffle_extensions(raffle_id);

-- ============================================================================
-- 5. PAYMENTS
-- ============================================================================
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    raffle_id           UUID NOT NULL REFERENCES raffles(id),
    ticket_count        INTEGER NOT NULL CHECK (ticket_count > 0),
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    gateway             payment_gateway NOT NULL,
    gateway_ref         VARCHAR(255),                 -- external transaction id
    status              payment_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gateway_ref UNIQUE (gateway, gateway_ref)
);

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_raffle ON payments(raffle_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ============================================================================
-- 6. TICKETS
-- One row per ticket number. ticket_number is unique within a raffle.
-- A single payment can cover multiple tickets (ticket_count in payments).
-- ============================================================================
CREATE TABLE tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id           UUID NOT NULL REFERENCES raffles(id),
    ticket_number        INTEGER NOT NULL,
    user_id             UUID NOT NULL REFERENCES users(id),
    payment_id          UUID NOT NULL REFERENCES payments(id),
    purchased_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_raffle_ticket_number UNIQUE (raffle_id, ticket_number),
    CONSTRAINT chk_ticket_number_positive CHECK (ticket_number > 0)
);

CREATE INDEX idx_tickets_raffle ON tickets(raffle_id);
CREATE INDEX idx_tickets_user ON tickets(user_id);
CREATE INDEX idx_tickets_payment ON tickets(payment_id);

-- ----------------------------------------------------------------------------
-- 6a. Enforce: ticket_number must not exceed raffle.ticket_cap
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_ticket_number_within_cap()
RETURNS TRIGGER AS $$
DECLARE
    v_cap INTEGER;
BEGIN
    SELECT ticket_cap INTO v_cap FROM raffles WHERE id = NEW.raffle_id;
    IF NEW.ticket_number > v_cap THEN
        RAISE EXCEPTION 'ticket_number % exceeds raffle cap %', NEW.ticket_number, v_cap;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_within_cap
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION enforce_ticket_number_within_cap();

-- ----------------------------------------------------------------------------
-- 6b. Enforce: a user cannot exceed raffle.max_tickets_per_user
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_max_tickets_per_user()
RETURNS TRIGGER AS $$
DECLARE
    v_max     INTEGER;
    v_current INTEGER;
BEGIN
    SELECT max_tickets_per_user INTO v_max FROM raffles WHERE id = NEW.raffle_id;

    SELECT COUNT(*) INTO v_current
    FROM tickets
    WHERE raffle_id = NEW.raffle_id AND user_id = NEW.user_id;

    IF v_current + 1 > v_max THEN
        RAISE EXCEPTION 'user % would exceed max_tickets_per_user (%) for raffle %',
            NEW.user_id, v_max, NEW.raffle_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_max_per_user
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION enforce_max_tickets_per_user();

-- ----------------------------------------------------------------------------
-- 6c. Enforce: cannot sell tickets into a raffle that is not 'open'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_raffle_open_for_ticket_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_status raffle_status;
BEGIN
    SELECT status INTO v_status FROM raffles WHERE id = NEW.raffle_id;
    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'raffle % is not open for ticket sales (status: %)', NEW.raffle_id, v_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_raffle_must_be_open
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION enforce_raffle_open_for_ticket_sale();

-- ============================================================================
-- 7. DRAW TRIGGERS
-- The system randomly selects one participant to receive the "pull the
-- lever" link. If it expires unclicked, a new row is created (attempt_number
-- increments) — the raffle is never permanently blocked by one unresponsive user.
-- ============================================================================
CREATE TABLE draw_triggers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id           UUID NOT NULL REFERENCES raffles(id),
    selected_user_id    UUID NOT NULL REFERENCES users(id),
    attempt_number       INTEGER NOT NULL DEFAULT 1,
    link_token          TEXT NOT NULL UNIQUE,
    status              trigger_status NOT NULL DEFAULT 'pending',
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    clicked_at          TIMESTAMPTZ,
    clicked_ip          INET,

    CONSTRAINT chk_attempt_positive CHECK (attempt_number > 0)
);

CREATE INDEX idx_draw_triggers_raffle ON draw_triggers(raffle_id);
CREATE UNIQUE INDEX idx_draw_triggers_active_per_raffle
    ON draw_triggers(raffle_id)
    WHERE status = 'pending';   -- only one live trigger at a time per raffle

-- ============================================================================
-- 8. DRAW RESULTS — provably-fair record
-- ============================================================================
CREATE TABLE draw_results (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id               UUID NOT NULL UNIQUE REFERENCES raffles(id),
    draw_trigger_id          UUID NOT NULL REFERENCES draw_triggers(id),

    server_seed              TEXT NOT NULL,          -- revealed only after draw
    server_seed_hash         TEXT NOT NULL,           -- published BEFORE raffle opens
    client_seed              TEXT NOT NULL,            -- trigger click timestamp + entropy
    final_seed_hash          TEXT NOT NULL,             -- sha256(server_seed || client_seed)

    winning_ticket_number     INTEGER NOT NULL,
    winner_user_id            UUID NOT NULL REFERENCES users(id),

    drawn_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_draw_results_winner ON draw_results(winner_user_id);

-- ============================================================================
-- 9. PAYOUTS
-- ============================================================================
CREATE TABLE payouts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id               UUID NOT NULL UNIQUE REFERENCES raffles(id),
    draw_result_id           UUID NOT NULL UNIQUE REFERENCES draw_results(id),
    winner_user_id            UUID NOT NULL REFERENCES users(id),

    gross_prize_value         NUMERIC(12,2) NOT NULL CHECK (gross_prize_value > 0),
    tax_rate                  NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    tax_withheld               NUMERIC(12,2) NOT NULL,
    net_value                  NUMERIC(12,2) NOT NULL,

    claim_status                claim_status NOT NULL DEFAULT 'pending_claim',
    id_document_url             TEXT,
    id_verified_at               TIMESTAMPTZ,

    delivery_method              delivery_method,
    delivery_address              TEXT,

    fulfillment_status            fulfillment_status NOT NULL DEFAULT 'processing',

    claim_deadline                 TIMESTAMPTZ NOT NULL,   -- winner forfeits if unclaimed
    claimed_at                      TIMESTAMPTZ,
    fulfilled_at                     TIMESTAMPTZ,

    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_net_value CHECK (net_value = gross_prize_value - tax_withheld)
);

CREATE TRIGGER trg_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_payouts_winner ON payouts(winner_user_id);
CREATE INDEX idx_payouts_claim_status ON payouts(claim_status);

-- ============================================================================
-- 10. NOTIFICATIONS (SMS log)
-- ============================================================================
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    raffle_id           UUID REFERENCES raffles(id),
    type                notification_type NOT NULL,
    message             TEXT NOT NULL,
    status              notification_status NOT NULL DEFAULT 'sent',
    provider_ref        VARCHAR(255),               -- SMS gateway message id
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_raffle ON notifications(raffle_id);

-- ============================================================================
-- 11. AUDIT LOG — compliance / NLA-facing trail
-- ============================================================================
CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type          actor_type NOT NULL,
    actor_id            UUID,                       -- nullable for actor_type='system'
    action              VARCHAR(255) NOT NULL,       -- e.g. 'raffle.created', 'raffle.extended'
    entity_type         VARCHAR(100) NOT NULL,       -- e.g. 'raffle', 'payout'
    entity_id           UUID NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ============================================================================
-- CONVENIENCE VIEWS
-- ============================================================================

-- Live ticket count + fill status per raffle
CREATE VIEW v_raffle_progress AS
SELECT
    r.id                AS raffle_id,
    r.title,
    r.ticket_cap,
    COUNT(t.id)          AS tickets_sold,
    r.ticket_cap - COUNT(t.id) AS tickets_remaining,
    r.deadline_at,
    r.status
FROM raffles r
LEFT JOIN tickets t ON t.raffle_id = r.id
GROUP BY r.id;

-- Per-user odds within an open raffle (ticket-weighted, transparent to app)
CREATE VIEW v_user_raffle_odds AS
SELECT
    t.raffle_id,
    t.user_id,
    COUNT(t.id)                          AS tickets_held,
    r.ticket_cap,
    ROUND(COUNT(t.id)::NUMERIC / r.ticket_cap * 100, 2) AS win_probability_pct
FROM tickets t
JOIN raffles r ON r.id = t.raffle_id
GROUP BY t.raffle_id, t.user_id, r.ticket_cap;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
