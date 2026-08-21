import { sql } from '../client.js';

export interface DbUser {
  id: string;
  phone: string;
  fullName: string | null;
  isSuspended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find a user by phone number.
 */
export async function findUserByPhone(phone: string): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    SELECT id, phone, full_name, is_suspended, created_at, updated_at
    FROM users
    WHERE phone = ${phone}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Find a user by ID.
 */
export async function findUserById(id: string): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    SELECT id, phone, full_name, is_suspended, created_at, updated_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Create a new user (auto-registered on first OTP verification).
 */
export async function createUser(phone: string): Promise<DbUser> {
  const rows = await sql<DbUser[]>`
    INSERT INTO users (phone)
    VALUES (${phone})
    RETURNING id, phone, full_name, is_suspended, created_at, updated_at
  `;
  return rows[0];
}

/**
 * Update a user's profile.
 */
export async function updateUser(
  id: string,
  updates: { fullName?: string }
): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    UPDATE users
    SET
      full_name = COALESCE(${updates.fullName ?? null}, full_name),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, phone, full_name, is_suspended, created_at, updated_at
  `;
  return rows[0] ?? null;
}

/**
 * Suspend or unsuspend a user (admin action).
 */
export async function setUserSuspended(id: string, suspended: boolean): Promise<DbUser | null> {
  const rows = await sql<DbUser[]>`
    UPDATE users
    SET is_suspended = ${suspended}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, phone, full_name, is_suspended, created_at, updated_at
  `;
  return rows[0] ?? null;
}

/**
 * List users with pagination.
 */
export async function listUsers(limit: number, offset: number): Promise<DbUser[]> {
  return sql<DbUser[]>`
    SELECT id, phone, full_name, is_suspended, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
