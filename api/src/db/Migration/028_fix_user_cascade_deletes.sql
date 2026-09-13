BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- adminDeleteUser (users.queries.ts) has always been a plain
-- `DELETE FROM users WHERE id = ...`, relying entirely on every
-- referencing table having ON DELETE CASCADE — that's true for
-- payments/tickets/draw_triggers/draw_results/payouts/notifications, but
-- three tables were missed: room_messages (chat history), and this
-- session's two new tables (draw_representatives, user_login_events),
-- which defaulted to NO ACTION. Deleting a user who'd ever sent a room
-- chat message, been a draw representative, or simply logged in since
-- login tracking shipped hit a foreign-key violation instead — surfaced
-- to the admin as a generic "Delete failed" with no indication why.

ALTER TABLE room_messages DROP CONSTRAINT room_messages_sender_user_id_fkey;
ALTER TABLE room_messages ADD CONSTRAINT room_messages_sender_user_id_fkey
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE draw_representatives DROP CONSTRAINT draw_representatives_user_id_fkey;
ALTER TABLE draw_representatives ADD CONSTRAINT draw_representatives_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_login_events DROP CONSTRAINT user_login_events_user_id_fkey;
ALTER TABLE user_login_events ADD CONSTRAINT user_login_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;
