-- A draw URL is a bearer credential. Its POST additionally requires a
-- one-time nonce returned by the context GET, preventing blind cross-site
-- form submissions from consuming the link.
SET search_path TO "Tombola_DB", public;

ALTER TABLE draw_triggers
  ADD COLUMN IF NOT EXISTS spin_nonce_hash VARCHAR(64);
