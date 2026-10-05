import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const schema = `otp_security_${crypto.randomUUID().replaceAll('-', '')}`;
let sql: typeof import('../src/db/client.js').sql;
let otp: typeof import('../src/db/queries/otp.queries.js');
let users: typeof import('../src/db/queries/users.queries.js');
let passwordHash: string;

suite('OTP concurrency and session revocation with real PostgreSQL', () => {
  beforeAll(async () => {
    if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
      throw new Error('Use an explicitly supplied disposable local database');
    }
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = databaseUrl;
    process.env.DB_SCHEMA = schema;
    process.env.DB_SSL = 'false';
    process.env.JWT_ACCESS_SECRET = 'test-only-access-otp-security-0123456789';
    process.env.JWT_REFRESH_SECRET = 'test-only-refresh-otp-security-0123456789';
    ({ sql } = await import('../src/db/client.js'));
    await sql`CREATE SCHEMA ${sql(schema)}`;
    await sql`CREATE TABLE otp_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_number text NOT NULL,
      code_hash text NOT NULL, purpose text NOT NULL, attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 5, expires_at timestamptz NOT NULL,
      verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW())`;
    otp = await import('../src/db/queries/otp.queries.js');
    users = await import('../src/db/queries/users.queries.js');
    passwordHash = await Bun.password.hash('847291', { algorithm: 'bcrypt', cost: 4 });
  });
  beforeEach(async () => { await sql`DELETE FROM otp_codes`; await sql`DELETE FROM users`; });
  afterAll(async () => {
    if (sql) { await sql`DROP SCHEMA ${sql(schema)} CASCADE`; await sql.end(); }
  });

  const phone = '+251911111111';
  async function issue(purpose: 'login' | 'claim_verification' = 'login', expiresAt = new Date(Date.now() + 60_000)) {
    return otp.createOtpCode({ phoneNumber: phone, codeHash: passwordHash, purpose, expiresAt });
  }
  test('20 concurrent valid requests consume one code exactly once', async () => {
    await issue();
    const results = await Promise.all(Array.from({ length: 20 }, () => otp.consumeLoginOtp(phone, '847291')));
    expect(results.filter((result) => result === 'verified')).toHaveLength(1);
    const [row] = await sql`SELECT attempts, verified_at FROM otp_codes`;
    expect(row.attempts).toBe(1);
    expect(row.verifiedAt).not.toBeNull();
  });
  test('concurrent wrong attempts commit and cannot exceed the five-attempt budget', async () => {
    await issue();
    const results = await Promise.all(Array.from({ length: 20 }, () => otp.consumeLoginOtp(phone, '000000')));
    expect(results.filter((result) => result === 'invalid')).toHaveLength(5);
    expect(results.filter((result) => result === 'exhausted')).toHaveLength(15);
    expect(await otp.consumeLoginOtp(phone, '847291')).toBe('exhausted');
    const [row] = await sql`SELECT attempts FROM otp_codes`;
    expect(row.attempts).toBe(5);
  });
  test('expired and non-login challenges cannot authenticate', async () => {
    await issue('login', new Date(Date.now() - 1000));
    expect(await otp.consumeLoginOtp(phone, '847291')).toBe('expired');
    await sql`DELETE FROM otp_codes`;
    await issue('claim_verification');
    expect(await otp.consumeLoginOtp(phone, '847291')).toBe('missing');
  });
  test('concurrent issuance leaves one challenge for the same purpose', async () => {
    await Promise.all(Array.from({ length: 10 }, () => issue()));
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM otp_codes WHERE verified_at IS NULL`;
    expect(row.count).toBe(1);
  });
  test('a login challenge also replaces an older signup challenge', async () => {
    await otp.createOtpCode({ phoneNumber: phone, codeHash: passwordHash, purpose: 'signup', expiresAt: new Date(Date.now() + 60_000) });
    await issue();
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM otp_codes WHERE verified_at IS NULL`;
    expect(row.count).toBe(1);
  });
  test('a stale logout cannot revoke a newer session; current logout is idempotent', async () => {
    const [user] = await sql`INSERT INTO users (session_version) VALUES (2) RETURNING id`;
    expect(await users.revokeUserSession(user.id, 1)).toBe(false);
    const results = await Promise.all(Array.from({ length: 10 }, () => users.revokeUserSession(user.id, 2)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const [row] = await sql`SELECT session_version FROM users WHERE id = ${user.id}`;
    expect(row.sessionVersion).toBe(3);
  });
});
