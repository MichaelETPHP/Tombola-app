-- Adds a 'ready' state to trigger_status: a draw-trigger link that has
-- been generated (and its random recipient already selected) but not yet
-- sent. Lifecycle becomes: ready -> pending (sent) -> clicked, or
-- ready/pending -> expired. Additive only — every existing row keeps its
-- current status; nothing is backfilled.
SET search_path TO "Tombola_DB", public;

ALTER TYPE trigger_status ADD VALUE IF NOT EXISTS 'ready';
