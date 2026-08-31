-- Links one Telegram identity to one verified Tombola phone account.
-- Mini App users who are not linked yet complete the existing SMS OTP flow
-- before these columns are populated, preserving the one-phone purchase rule.
ALTER TABLE "Tombola_DB".users
  ADD COLUMN IF NOT EXISTS telegram_user_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64),
  ADD COLUMN IF NOT EXISTS telegram_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telegram_user_id
  ON "Tombola_DB".users (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_telegram_username
  ON "Tombola_DB".users (telegram_username)
  WHERE telegram_username IS NOT NULL;
