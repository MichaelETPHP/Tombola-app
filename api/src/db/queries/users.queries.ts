import { sql } from '../client.js';

export type UserStatus = 'active' | 'suspended' | 'banned';

export interface DbUser {
  id: string;
  phoneNumber: string;
  phoneVerifiedAt: Date | null;
  fullName: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  telegramLinkedAt: Date | null;
  preferredLanguage?: 'en' | 'am';
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TelegramIdentity {
  userId: string;
  username?: string | null;
  photoUrl?: string | null;
  fullName?: string | null;
}

/**
 * Find a user by phone number.
 */
export async function findUserByPhone(phoneNumber: string): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    SELECT * FROM users WHERE phone_number = ${phoneNumber} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Find a user by ID.
 */
export async function findUserById(id: string): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findUserByTelegramId(telegramUserId: string): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    SELECT * FROM users WHERE telegram_user_id = ${telegramUserId} LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Create a new user (auto-registered on first OTP verification — the
 * number is already confirmed at that point, so phone_verified_at is set).
 */
export async function createUser(phoneNumber: string): Promise<DbUser> {
  const rows = await sql<DbUser[]>`
    INSERT INTO users (phone_number, phone_verified_at)
    VALUES (${phoneNumber}, NOW())
    RETURNING *
  `;
  return rows[0];
}

/** Atomically attach a Telegram identity. The unique index prevents one
 * Telegram account from being connected to multiple Tombola users. */
export async function linkTelegramIdentity(
  userId: string,
  identity: TelegramIdentity
): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    UPDATE users SET
      telegram_user_id = ${identity.userId},
      telegram_username = ${identity.username ?? null},
      telegram_photo_url = ${identity.photoUrl ?? null},
      telegram_linked_at = COALESCE(telegram_linked_at, NOW()),
      full_name = COALESCE(full_name, ${identity.fullName ?? null}),
      updated_at = NOW()
    WHERE id = ${userId}
      AND (telegram_user_id IS NULL OR telegram_user_id = ${identity.userId})
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Update a user's profile.
 */
export async function updateUser(
  id: string,
  updates: { fullName?: string | null; preferredLanguage?: 'en' | 'am' }
): Promise<DbUser | null> {
  try {
    const rows = updates.preferredLanguage
      ? await sql<DbUser[]>`
          UPDATE users SET
            full_name = COALESCE(${updates.fullName ?? null}, full_name),
            preferred_language = ${updates.preferredLanguage}, updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `
      : await sql<DbUser[]>`
          UPDATE users SET full_name = COALESCE(${updates.fullName ?? null}, full_name), updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `;
    return rows[0] ?? null;
  } catch (error) {
    // Backward-compatible during rollout: old databases continue supporting
    // name updates until migration 003 is applied by the table owner.
    if ((error as { code?: string }).code !== '42703') throw error;
    const rows = await sql<DbUser[]>`
      UPDATE users SET full_name = COALESCE(${updates.fullName ?? null}, full_name), updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] ?? null;
  }
}

/**
 * Suspend or unsuspend a user (admin action). Maps the boolean toggle onto
 * the `active`/`suspended` states of the `status` enum — `banned` is a
 * separate, more permanent state this endpoint doesn't set.
 */
export async function setUserSuspended(id: string, suspended: boolean): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    UPDATE users
    SET status = ${suspended ? 'suspended' : 'active'}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * List users with pagination.
 */
export async function listUsers(limit: number, offset: number): Promise<DbUser[]> {
  return sql<DbUser[]>`
    SELECT * FROM users
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
