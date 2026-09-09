-- Apply before deploying number-selection clients. Additive; existing tickets keep their numbers.
BEGIN;
SET search_path TO "Tombola_DB", public;
LOCK TABLE raffles, payments, tickets IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS selected_numbers INTEGER[],
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkout_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_user_idempotency ON payments(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_reservations ON payments(raffle_id, reservation_expires_at) WHERE status = 'pending';

-- Sparse inventory: a row is either a live hold or a sold number. All issuers
-- share this primary key, including legacy/manual ticket inserts via the trigger.
CREATE TABLE IF NOT EXISTS ticket_number_claims (
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL CHECK (ticket_number > 0),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  sold BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (raffle_id, ticket_number)
);
CREATE INDEX IF NOT EXISTS idx_ticket_claim_payment ON ticket_number_claims(payment_id);
INSERT INTO ticket_number_claims (raffle_id, ticket_number, payment_id, sold)
SELECT raffle_id, ticket_number, payment_id, true FROM tickets
ON CONFLICT (raffle_id, ticket_number) DO NOTHING;

-- Protect in-flight legacy payments too. Allocate actual free numbers without
-- renumbering tickets. Abort the migration rather than silently dropping orders.
DO $$
DECLARE p RECORD; chosen INTEGER[];
BEGIN
  FOR p IN SELECT * FROM payments WHERE status = 'pending' AND selected_numbers IS NULL ORDER BY created_at, id LOOP
    SELECT array_agg(n ORDER BY n) INTO chosen FROM (
      SELECT n FROM raffles r CROSS JOIN LATERAL generate_series(1, r.ticket_cap) n
      WHERE r.id = p.raffle_id AND NOT EXISTS (
        SELECT 1 FROM ticket_number_claims c WHERE c.raffle_id = r.id AND c.ticket_number = n
      ) ORDER BY n LIMIT p.ticket_count
    ) free;
    IF COALESCE(cardinality(chosen), 0) <> p.ticket_count THEN
      RAISE EXCEPTION 'Insufficient inventory for pending payment %. Reconcile legacy payments first.', p.id;
    END IF;
    UPDATE payments SET selected_numbers = chosen, reservation_expires_at = now() + interval '15 minutes',
      checkout_started_at = created_at WHERE id = p.id;
    INSERT INTO ticket_number_claims SELECT p.raffle_id, unnest(chosen), p.id, false;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION claim_issued_ticket_number() RETURNS TRIGGER AS $$
DECLARE claim_payment UUID;
BEGIN
  PERFORM 1 FROM raffles WHERE id = NEW.raffle_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM payments WHERE id = NEW.payment_id AND raffle_id = NEW.raffle_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Ticket payment does not match its raffle and owner';
  END IF;
  INSERT INTO ticket_number_claims (raffle_id, ticket_number, payment_id, sold)
  VALUES (NEW.raffle_id, NEW.ticket_number, NEW.payment_id, true)
  ON CONFLICT (raffle_id, ticket_number) DO UPDATE SET sold = true
  WHERE ticket_number_claims.payment_id = EXCLUDED.payment_id
  RETURNING payment_id INTO claim_payment;
  IF claim_payment IS NULL THEN RAISE EXCEPTION 'Ticket number is reserved by another payment'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_claim_issued_ticket_number ON tickets;
CREATE TRIGGER trg_claim_issued_ticket_number BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION claim_issued_ticket_number();

-- Admin edits and draw transitions lock the same raffle row as checkout.
CREATE OR REPLACE FUNCTION protect_raffle_number_contract() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.ticket_cap, NEW.ticket_price, NEW.max_tickets_per_user) IS DISTINCT FROM
     (OLD.ticket_cap, OLD.ticket_price, OLD.max_tickets_per_user) AND
     (EXISTS (SELECT 1 FROM tickets WHERE raffle_id = OLD.id) OR
      EXISTS (SELECT 1 FROM payments WHERE raffle_id = OLD.id AND status = 'pending')) THEN
    RAISE EXCEPTION 'Ticket rules are locked while tickets or pending payments exist';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('locked', 'awaiting_trigger', 'drawing', 'completed', 'cancelled') AND
     EXISTS (SELECT 1 FROM payments WHERE raffle_id = OLD.id AND (status = 'pending' OR review_required)) THEN
    RAISE EXCEPTION 'Reconcile pending payments and payment reviews before closing this raffle';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_protect_raffle_number_contract ON raffles;
CREATE TRIGGER trg_protect_raffle_number_contract BEFORE UPDATE ON raffles FOR EACH ROW EXECUTE FUNCTION protect_raffle_number_contract();
COMMIT;
