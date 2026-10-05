import { sql } from '../client.js';

export type OtpPurpose = 'signup' | 'login' | 'claim_verification';

export interface DbOtpCode {
  id: string;
  phoneNumber: string;
  codeHash: string;
  purpose: OtpPurpose;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
}

export async function createOtpCode(data: {
  phoneNumber: string;
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
}): Promise<DbOtpCode> {
  return sql.begin(async (tx) => {
    await tx`
      DELETE FROM otp_codes
      WHERE phone_number = ${data.phoneNumber}
        AND purpose = ${data.purpose}
        AND verified_at IS NULL
    `;
    const [otp] = await tx<DbOtpCode[]>`
      INSERT INTO otp_codes (phone_number, code_hash, purpose, expires_at)
      VALUES (${data.phoneNumber}, ${data.codeHash}, ${data.purpose}, ${data.expiresAt})
      RETURNING *
    `;
    return otp;
  });
}

export async function findLatestOtp(phoneNumber: string): Promise<DbOtpCode | null> {
  const rows = await sql<DbOtpCode[]>`
    SELECT * FROM otp_codes
    WHERE phone_number = ${phoneNumber} AND verified_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function incrementOtpAttempts(id: string): Promise<void> {
  await sql`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${id} AND attempts < max_attempts`;
}

export async function markOtpVerified(id: string): Promise<void> {
  await sql`UPDATE otp_codes SET verified_at = NOW() WHERE id = ${id}`;
}

export async function deleteExpiredOtps(): Promise<void> {
  await sql`DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '1 day'`;
}
