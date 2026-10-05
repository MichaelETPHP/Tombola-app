-- Repairs only the original development seed owner created by 002_seed_data.sql.
-- This does not alter production-created administrators or participant data.
UPDATE "Tombola_DB".admin_users
SET password_hash = '$2b$10$MPDlEo8KeVtPYLHSqolhzObZ3bQbk5YANKlfbAdHi7gQeJeFE1Yey',
    updated_at = NOW()
WHERE id = 'a0000001-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  AND phone_number = '+251911000001'
  AND password_hash = '$2b$10$LXE5kJz8nX0JK3k5PJE5x.vZ8kzJ8s3k5PJE5xLXE5kJz8nX0JK3';
