import { sql } from '../client.js';

export interface DbAdminUser {
  id: string;
  phoneNumber: string;
  passwordHash: string;
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
