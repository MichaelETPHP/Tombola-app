-- The Telegram group for a raffle is created manually, offline, by the
-- admin (Bot API has no method for a bot to create a group on its own) —
-- this just stores the invite link they paste in at creation time so the
-- app can hand it to ticket buyers. Nullable: optional per raffle, and
-- not every existing raffle will have one.
ALTER TABLE "Tombola_DB".raffles
  ADD COLUMN IF NOT EXISTS telegram_group_link TEXT;
