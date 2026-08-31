-- Migration 007: Add ON DELETE CASCADE to all child tables that reference users(id).
-- This allows admin hard-deletion of user accounts without manually clearing
-- every child table first.
--
-- Tables that reference users(id):
--   payments          → user_id
--   tickets           → user_id
--   draw_triggers     → selected_user_id
--   draw_results      → winner_user_id
--   payouts           → winner_user_id
--   notifications     → user_id

-- payments
ALTER TABLE "Tombola_DB".payments
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey,
  ADD  CONSTRAINT payments_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;

-- tickets
ALTER TABLE "Tombola_DB".tickets
  DROP CONSTRAINT IF EXISTS tickets_user_id_fkey,
  ADD  CONSTRAINT tickets_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;

-- draw_triggers (selected_user_id — the user chosen to pull the lever)
ALTER TABLE "Tombola_DB".draw_triggers
  DROP CONSTRAINT IF EXISTS draw_triggers_selected_user_id_fkey,
  ADD  CONSTRAINT draw_triggers_selected_user_id_fkey
       FOREIGN KEY (selected_user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;

-- draw_results (winner_user_id only — no selected_user_id here)
ALTER TABLE "Tombola_DB".draw_results
  DROP CONSTRAINT IF EXISTS draw_results_winner_user_id_fkey,
  ADD  CONSTRAINT draw_results_winner_user_id_fkey
       FOREIGN KEY (winner_user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;

-- payouts
ALTER TABLE "Tombola_DB".payouts
  DROP CONSTRAINT IF EXISTS payouts_winner_user_id_fkey,
  ADD  CONSTRAINT payouts_winner_user_id_fkey
       FOREIGN KEY (winner_user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE "Tombola_DB".notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD  CONSTRAINT notifications_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES "Tombola_DB".users(id) ON DELETE CASCADE;
