import { sql } from './client.js';
import { z } from 'zod';

/** Explicit provisioning/rotation; credentials never enter command arguments or logs. */
const input = z.object({
  phone: z.string().regex(/^\+251\d{9}$/),
  password: z.string().min(16).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
}).parse({ phone: process.env.OWNER_PHONE, password: process.env.OWNER_PASSWORD });

try {
  const passwordHash = await Bun.password.hash(input.password, { algorithm: 'bcrypt', cost: 12 });
  const rotate = process.argv.includes('--rotate');
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('owner-provisioning'))`;
    const [existing] = await tx<{ id: string; role: string }[]>`
      SELECT id, role FROM admin_users WHERE phone_number = ${input.phone} FOR UPDATE
    `;
    if (existing && (!rotate || existing.role !== 'owner')) {
      throw new Error('Account exists; only an existing owner may be explicitly rotated with --rotate');
    }
    if (existing) {
      await tx`UPDATE admin_users SET password_hash = ${passwordHash},
        session_version = session_version + 1, updated_at = NOW() WHERE id = ${existing.id}`;
    } else {
      await tx`INSERT INTO admin_users (phone_number, password_hash, role)
        VALUES (${input.phone}, ${passwordHash}, 'owner')`;
    }
  });
  console.log('Owner credentials provisioned. Previous sessions are revoked on rotation.');
} finally {
  await sql.end();
}
