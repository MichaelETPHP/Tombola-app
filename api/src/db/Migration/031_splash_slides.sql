BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET search_path TO "Tombola_DB", public;

-- Backs the admin-editable splash-screen carousel (2 fixed slides — see
-- SplashScreen.svelte on the mobile app). Seeded with the app's current
-- bundled images so behavior is unchanged until an admin actually uploads
-- a replacement; the mobile app falls back to those same bundled files if
-- this table is ever empty or the request fails, so this is never a single
-- point of failure for the app's very first screen.
CREATE TABLE IF NOT EXISTS splash_slides (
  slot INTEGER PRIMARY KEY CHECK (slot IN (1, 2)),
  image_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES admin_users(id)
);

INSERT INTO splash_slides (slot, image_url) VALUES
  (1, '/images/splash-screen-1.jpg'),
  (2, '/images/splash-screen-2.jpg')
ON CONFLICT (slot) DO NOTHING;

COMMIT;
