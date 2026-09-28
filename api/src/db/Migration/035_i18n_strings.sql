BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB_DEV", public;

-- Backs the admin-editable translation strings (see the Translations page
-- in admin-app). Every row is one dot-path key from the mobile app's
-- bundled en.json/am.json (e.g. "numbers.continue") plus the locale it
-- belongs to. Seeded once from those files' current content via
-- api/src/db/seed-i18n.ts (run separately, not part of this migration —
-- ~740 rows is unwieldy as inline SQL and the seed is idempotent, so it's
-- safe to run any time).
--
-- The mobile app fetches this table at boot and merges it over its own
-- bundled JSON via svelte-i18n's addMessages() — so an empty or
-- unreachable table is never a single point of failure, the same
-- reasoning as splash_slides above it in this file's own history.
CREATE TABLE IF NOT EXISTS i18n_strings (
  locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES admin_users(id),
  PRIMARY KEY (locale, key)
);

COMMIT;
