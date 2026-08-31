import { sql } from '../client.js';

export interface DbAdminUser {
  id: string;
  phoneNumber: string;
  passwordHash: string;
  fullName: string | null;
  role: 'owner' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
}

export async function findAdminByPhone(phoneNumber: string): Promise<DbAdminUser | null> {
  const rows = await sql<DbAdminUser[]>`
    SELECT *
    FROM admin_users
    WHERE phone_number = ${phoneNumber}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findAdminById(id: string): Promise<DbAdminUser | null> {
  const rows = await sql<DbAdminUser[]>`SELECT * FROM admin_users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findFirstAdmin(): Promise<DbAdminUser | null> {
  const rows = await sql<DbAdminUser[]>`
    SELECT *
    FROM admin_users
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listAdmins(): Promise<DbAdminUser[]> {
  return sql<DbAdminUser[]>`SELECT * FROM admin_users ORDER BY created_at ASC`;
}

export async function countAdminsByRole(role: 'owner' | 'moderator'): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM admin_users WHERE role = ${role}
  `;
  return rows[0].count;
}

export async function createAdmin(data: {
  phoneNumber: string;
  passwordHash: string;
  fullName?: string;
  role: 'owner' | 'moderator';
}): Promise<DbAdminUser> {
  const rows = await sql<DbAdminUser[]>`
    INSERT INTO admin_users (phone_number, password_hash, full_name, role)
    VALUES (${data.phoneNumber}, ${data.passwordHash}, ${data.fullName ?? null}, ${data.role})
    RETURNING *
  `;
  return rows[0];
}

export async function updateAdmin(
  id: string,
  updates: Partial<Pick<DbAdminUser, 'fullName' | 'passwordHash' | 'role'>>
): Promise<DbAdminUser | null> {
  const keys = Object.keys(updates) as (keyof typeof updates)[];
  if (keys.length === 0) return findAdminById(id);
  const rows = await sql<DbAdminUser[]>`
    UPDATE admin_users
    SET ${sql(updates, ...keys)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function deleteAdmin(id: string): Promise<DbAdminUser | null> {
  const rows = await sql<DbAdminUser[]>`
    DELETE FROM admin_users WHERE id = ${id} RETURNING *
  `;
  return rows[0] ?? null;
}
