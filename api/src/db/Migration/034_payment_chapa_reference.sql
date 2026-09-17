BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- payments.gateway_ref is OUR OWN generated tx_ref, sent to Chapa when we
-- initialize a transaction. Chapa's verify/webhook response carries its
-- own, separate reference (their `reference` field, e.g. "AP634JFwEbxd" —
-- what actually shows on Chapa's own dashboard/statements) plus which
-- specific mobile-money method the customer paid with (`payment_method`,
-- e.g. "telebirr"). Neither was ever captured before this. Both are
-- nullable: a non-Chapa gateway, a purely local cancel before Chapa ever
-- saw the transaction, or a payment made before this shipped has neither.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS chapa_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMIT;
