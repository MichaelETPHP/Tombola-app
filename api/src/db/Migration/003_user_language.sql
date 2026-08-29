-- Adds persisted language preference for existing Tombola installations.
ALTER TABLE "Tombola_DB".users
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'users_preferred_language_check'
      AND n.nspname = 'Tombola_DB'
  ) THEN
    ALTER TABLE "Tombola_DB".users
      ADD CONSTRAINT users_preferred_language_check
      CHECK (preferred_language IN ('en', 'am'));
  END IF;
END $$;
