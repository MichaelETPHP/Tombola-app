BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Admin-manageable list of ways a winner can receive their prize — was a
-- fixed ('pickup' | 'delivery') enum, which can't grow without a migration
-- every time the business wants to offer a new option (bank transfer,
-- mobile money, a courier partner, ...). Deactivate rather than delete a
-- method that's no longer offered — winners who already claimed under it
-- keep an accurate historical record (see payouts.delivery_method below,
-- which stores the method's label as plain text, not a foreign key, for
-- exactly that reason).
CREATE TABLE IF NOT EXISTS payout_delivery_methods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label             TEXT NOT NULL,
  -- Whether choosing this method requires the winner to also fill in a
  -- free-text details field (a delivery address, a bank account number,
  -- ...) — false for something like "Pickup at office" that needs nothing
  -- further. details_label is what that field is captioned with.
  requires_details  BOOLEAN NOT NULL DEFAULT true,
  details_label     TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payout_delivery_methods (label, requires_details, details_label, sort_order) VALUES
  ('Pickup at office', false, NULL, 0),
  ('Home delivery', true, 'Delivery address', 1),
  ('Bank transfer', true, 'Bank account / mobile money number', 2)
ON CONFLICT DO NOTHING;

-- payouts.delivery_method was a rigid ('pickup' | 'delivery') enum;
-- widen it to plain text so it can hold whatever label a winner picked
-- from the now-dynamic list above, including a method added after this
-- migration ran.
ALTER TABLE payouts ALTER COLUMN delivery_method TYPE TEXT USING delivery_method::TEXT;
DROP TYPE IF EXISTS delivery_method;

COMMIT;
