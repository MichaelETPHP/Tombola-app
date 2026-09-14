BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Replaces the per-raffle-block scramble (migration 029) with a single
-- platform-wide cipher applied directly over the *entire* 6-digit
-- (0-999999) space. The block scheme kept each raffle's tickets confined to
-- its own small, contiguous slice — correctly scrambled inside that slice,
-- but visibly clustered (e.g. every number in a 150-ticket raffle started
-- with the same 3-4 leading digits) instead of looking randomly placed
-- across the full range.
--
-- Now: every ticket ever issued gets a global index (this raffle's
-- number_block_start + its position within the raffle — still a simple,
-- non-overlapping per-raffle range, but the index itself is never shown to
-- anyone). That global index is scrambled through ONE Feistel cipher keyed
-- by this single secret, over the full 1,000,000-slot domain — so two
-- tickets sitting next to each other in the same raffle land wherever the
-- cipher sends them, anywhere in the range, with zero cross-raffle
-- collisions guaranteed by the cipher being a true bijection (see
-- ticket-cipher.ts). raffles.number_seed (migration 024) is superseded by
-- this and no longer read — left in place, unused, rather than spending a
-- migration on dropping a harmless nullable column.
ALTER TABLE ticket_number_allocator ADD COLUMN IF NOT EXISTS cipher_key TEXT;

-- Two concatenated v4 UUIDs give ~244 bits of real randomness without
-- depending on pgcrypto's gen_random_bytes (gen_random_uuid() alone is
-- built into Postgres core since v13, no extension needed).
UPDATE ticket_number_allocator
SET cipher_key = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE id = 1 AND cipher_key IS NULL;

ALTER TABLE ticket_number_allocator ALTER COLUMN cipher_key SET NOT NULL;

COMMIT;
