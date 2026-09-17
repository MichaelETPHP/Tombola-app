BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- user_login_events only ever recorded a login. Widen it to also record a
-- logout, so the admin user-detail page can show a real session timeline
-- ("logged in at X, logged out at Y") instead of just arrival times.
-- Existing rows are all logins by definition — backfill the new column
-- rather than leaving it nullable and forcing every reader to guess.
ALTER TABLE user_login_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(10) NOT NULL DEFAULT 'login';
ALTER TABLE user_login_events ADD CONSTRAINT chk_user_login_events_type CHECK (event_type IN ('login', 'logout'));
-- method is meaningless for a logout (there's no "logout method") — nullable
-- from here on; existing login rows keep whatever they already have.
ALTER TABLE user_login_events ALTER COLUMN method DROP NOT NULL;

-- payments.review_required (a Chapa charge that verified successfully but
-- couldn't issue its reserved numbers — see completePaymentAndIssueTickets)
-- has existed since ticket-number selection shipped, but nothing ever
-- surfaced it to an admin: it just sat in the table, invisible, while a
-- real customer had been charged. This index is what makes "show me every
-- payment currently stuck needing review" a fast, indexed query instead of
-- a full table scan, for the new admin review queue.
CREATE INDEX IF NOT EXISTS idx_payments_review_required ON payments(created_at DESC) WHERE review_required;

COMMIT;
