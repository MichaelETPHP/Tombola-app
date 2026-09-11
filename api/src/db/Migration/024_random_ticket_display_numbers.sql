BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Per-raffle key for the display-number scramble (see
-- lib/ticket-display-number.ts). NULL for every raffle that already
-- exists — that's what keeps their tickets showing the same plain
-- sequential numbers buyers already have on receipts/SMS. Only raffles
-- created after this ships get a seed, and therefore scrambled numbers.
ALTER TABLE "Tombola_DB".raffles
  ADD COLUMN IF NOT EXISTS number_seed INTEGER;

COMMIT;
