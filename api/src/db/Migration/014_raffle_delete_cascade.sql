-- Migration 014: Add ON DELETE CASCADE to every child table that references
-- a raffle (directly, or transitively via raffle_prizes/draw_triggers/
-- draw_results), so an admin can hard-delete a raffle in one statement
-- without manually clearing tickets, prizes, draw triggers, draw results,
-- payouts, notifications, and room messages first. Mirrors exactly how
-- 007_user_delete_cascade.sql did the same thing for user deletion.
--
-- Tables that reference a raffle, directly or transitively:
--   tickets           → raffle_id          (missing cascade — fixed here)
--   payments          → raffle_id
--   raffle_prizes     → raffle_id
--   draw_triggers     → raffle_id, prize_id
--   draw_results      → raffle_id, draw_trigger_id, prize_id
--   payouts           → raffle_id, draw_result_id
--   notifications     → raffle_id (nullable — still cascades cleanly)
--   room_messages     → raffle_id
--
-- raffle_extensions.raffle_id already has ON DELETE CASCADE (001) and is
-- left untouched.

-- tickets
ALTER TABLE "Tombola_DB".tickets
  DROP CONSTRAINT IF EXISTS tickets_raffle_id_fkey,
  ADD  CONSTRAINT tickets_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;

-- payments
ALTER TABLE "Tombola_DB".payments
  DROP CONSTRAINT IF EXISTS payments_raffle_id_fkey,
  ADD  CONSTRAINT payments_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;

-- raffle_prizes
ALTER TABLE "Tombola_DB".raffle_prizes
  DROP CONSTRAINT IF EXISTS raffle_prizes_raffle_id_fkey,
  ADD  CONSTRAINT raffle_prizes_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;

-- draw_triggers
ALTER TABLE "Tombola_DB".draw_triggers
  DROP CONSTRAINT IF EXISTS draw_triggers_raffle_id_fkey,
  ADD  CONSTRAINT draw_triggers_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;
ALTER TABLE "Tombola_DB".draw_triggers
  DROP CONSTRAINT IF EXISTS draw_triggers_prize_id_fkey,
  ADD  CONSTRAINT draw_triggers_prize_id_fkey
       FOREIGN KEY (prize_id) REFERENCES "Tombola_DB".raffle_prizes(id) ON DELETE CASCADE;

-- draw_results
ALTER TABLE "Tombola_DB".draw_results
  DROP CONSTRAINT IF EXISTS draw_results_raffle_id_fkey,
  ADD  CONSTRAINT draw_results_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;
ALTER TABLE "Tombola_DB".draw_results
  DROP CONSTRAINT IF EXISTS draw_results_draw_trigger_id_fkey,
  ADD  CONSTRAINT draw_results_draw_trigger_id_fkey
       FOREIGN KEY (draw_trigger_id) REFERENCES "Tombola_DB".draw_triggers(id) ON DELETE CASCADE;
ALTER TABLE "Tombola_DB".draw_results
  DROP CONSTRAINT IF EXISTS draw_results_prize_id_fkey,
  ADD  CONSTRAINT draw_results_prize_id_fkey
       FOREIGN KEY (prize_id) REFERENCES "Tombola_DB".raffle_prizes(id) ON DELETE CASCADE;

-- payouts
ALTER TABLE "Tombola_DB".payouts
  DROP CONSTRAINT IF EXISTS payouts_raffle_id_fkey,
  ADD  CONSTRAINT payouts_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;
ALTER TABLE "Tombola_DB".payouts
  DROP CONSTRAINT IF EXISTS payouts_draw_result_id_fkey,
  ADD  CONSTRAINT payouts_draw_result_id_fkey
       FOREIGN KEY (draw_result_id) REFERENCES "Tombola_DB".draw_results(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE "Tombola_DB".notifications
  DROP CONSTRAINT IF EXISTS notifications_raffle_id_fkey,
  ADD  CONSTRAINT notifications_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;

-- room_messages
ALTER TABLE "Tombola_DB".room_messages
  DROP CONSTRAINT IF EXISTS room_messages_raffle_id_fkey,
  ADD  CONSTRAINT room_messages_raffle_id_fkey
       FOREIGN KEY (raffle_id) REFERENCES "Tombola_DB".raffles(id) ON DELETE CASCADE;
