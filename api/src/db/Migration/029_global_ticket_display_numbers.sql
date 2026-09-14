BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Replaces the per-raffle-only ticket_display_number.ts scheme (each raffle
-- independently scrambled 1..cap into its own 0-99999 range, computed
-- on-the-fly, never stored) with one that is:
--   1. Actually unique across the WHOLE platform, not just within one
--      raffle — every raffle gets a reserved, non-overlapping block of the
--      shared 6-digit (0-999999) space, sized to exactly that raffle's
--      ticket_cap, allocated once at raffle creation.
--   2. Computed with a Feistel-network cipher instead of a simple linear
--      formula — the old formula could be fully reverse-engineered from
--      just two known (ticket_number, display_number) pairs (which any
--      buyer of 2+ tickets already has) via basic algebra; this can't be.
--   3. Stored directly on the ticket at issuance, not recomputed
--      differently by every caller — this is what the admin dashboard bug
--      (showing a different number than the mobile app for the same
--      ticket) actually was: two independent, drifted implementations.
-- Deliberately introduced on a clean slate (all prior test raffles/tickets
-- deleted first) rather than backfilling old data — see the equivalent
-- reasoning already documented for number_seed in an earlier migration.

-- One row, atomically advanced by exactly `ticket_cap` each time a raffle
-- is created — this is what makes every raffle's block provably
-- non-overlapping with every other raffle's, forever.
CREATE TABLE ticket_number_allocator (
    id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    next_block_start  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO ticket_number_allocator (id, next_block_start) VALUES (1, 0);

ALTER TABLE raffles ADD COLUMN IF NOT EXISTS number_block_start INTEGER;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS display_number VARCHAR(6);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_display_number
    ON tickets(display_number) WHERE display_number IS NOT NULL;

COMMIT;
