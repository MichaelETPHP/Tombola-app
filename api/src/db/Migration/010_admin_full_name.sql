-- admin_users had no real profile fields at all — email/fullName in every
-- API response were synthesized on the fly (a fake @admin.tombola.local
-- address, and a generic "Platform Owner"/"Platform Moderator" string),
-- not stored, editable data. This adds the one that's actually meant to
-- be a real per-admin field; email stays synthesized since login is by
-- phone, not email.
ALTER TABLE "Tombola_DB".admin_users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
