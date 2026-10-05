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
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`otp:${data.phoneNumber}`}))`;
    await tx`
      DELETE FROM otp_codes
      WHERE phone_number = ${data.phoneNumber}
        AND (purpose = ${data.purpose}
          OR (${data.purpose === 'login' || data.purpose === 'signup'} AND purpose IN ('login', 'signup')))
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

export type OtpVerification = 'verified' | 'missing' | 'expired' | 'exhausted' | 'invalid';

/** Serialize issuance and verification for a phone; failed attempts must commit. */
export async function consumeLoginOtp(phoneNumber: string, code: string): Promise<OtpVerification> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`otp:${phoneNumber}`}))`;
    const [otp] = await tx<DbOtpCode[]>`
      SELECT * FROM otp_codes WHERE phone_number = ${phoneNumber}
        AND purpose IN ('login', 'signup') AND verified_at IS NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE
    `;
    if (!otp) return 'missing' as const;
    if (otp.expiresAt.getTime() <= Date.now()) return 'expired' as const;
    if (otp.attempts >= otp.maxAttempts) return 'exhausted' as const;
    await tx`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${otp.id}`;
    const valid = await Bun.password.verify(code, otp.codeHash).catch(() => false);
    if (!valid) return 'invalid' as const;
    await tx`UPDATE otp_codes SET verified_at = NOW() WHERE id = ${otp.id}`;
    return 'verified' as const;
  });
}

export async function deleteExpiredOtps(): Promise<void> {
  await sql`DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '1 day'`;
}
