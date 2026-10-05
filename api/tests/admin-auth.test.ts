import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

// Tests never connect to the configured application database or use real signing keys.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:9/no_network';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-not-for-production-012345';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-not-for-production-012345';

const { Hono } = await import('hono');
const queries = await import('../src/db/queries/admin.queries.js');
const { sql } = await import('../src/db/client.js');
const fixturePassword = 'fixture-only-password';
const passwordHash = await Bun.password.hash(fixturePassword, { algorithm: 'bcrypt', cost: 4 });
const fixture = {
  id: 'b277bdde-28cf-4e55-a5bd-7ec5cb81a4ea', phoneNumber: '+251900000000',
  passwordHash, fullName: 'Test administrator', role: 'owner' as const,
  sessionVersion: 0, createdAt: new Date(), updatedAt: new Date(),
};
let row: typeof fixture | null = { ...fixture };
mock.module('../src/db/queries/admin.queries.js', () => ({
  ...queries,
  findAdminByPhone: async () => row,
  findAdminById: async () => row,
}));

const { adminLogin } = await import('../src/modules/admin/admin.service.js');
const { refreshAccessToken } = await import('../src/modules/auth/auth.service.js');
const { isCurrentAdminSession, requireAdminSessionVersion } = await import('../src/lib/admin-session.js');
const { verifyAccessToken, verifyRefreshToken, signAccessToken } = await import('../src/lib/jwt.js');
const { authMiddleware } = await import('../src/middleware/auth.middleware.js');

beforeEach(() => { row = { ...fixture }; });
afterAll(async () => { mock.restore(); await sql.end(); });

describe('admin session regression', () => {
  test('a successful login issues usable access and refresh tokens, including version zero', async () => {
    const login = await adminLogin(fixture.phoneNumber, fixturePassword);
    const access = await verifyAccessToken(login.accessToken);
    const refresh = await verifyRefreshToken(login.refreshToken);
    expect(access.sessionVersion).toBe(0);
    expect(refresh.sessionVersion).toBe(0);
    expect(isCurrentAdminSession(access, row)).toBe(true);
    const restored = await refreshAccessToken(login.refreshToken);
    expect(isCurrentAdminSession(await verifyAccessToken(restored.accessToken), row)).toBe(true);
  });

  test('a missing migration is a service error, never a successful login', async () => {
    row = { ...fixture, sessionVersion: undefined as unknown as number };
    await expect(adminLogin(fixture.phoneNumber, fixturePassword)).rejects.toMatchObject({
      statusCode: 503, message: 'admin.sessionUnavailable',
    });
  });

  test('wrong credentials still fail with 401', async () => {
    await expect(adminLogin(fixture.phoneNumber, 'wrong-fixture-password')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('missing, malformed and negative versions are not defaulted to zero', () => {
    for (const version of [undefined, null, '0', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => requireAdminSessionVersion(version)).toThrow();
      expect(isCurrentAdminSession({ sub: fixture.id, role: 'owner', sessionVersion: version as number }, row)).toBe(false);
    }
    expect(requireAdminSessionVersion(0)).toBe(0);
    expect(requireAdminSessionVersion(42)).toBe(42);
  });

  test('revoked versions, deleted accounts and changed roles cannot refresh', async () => {
    const login = await adminLogin(fixture.phoneNumber, fixturePassword);
    for (const changed of [
      { ...fixture, sessionVersion: 1 },
      { ...fixture, role: 'moderator' as 'owner' },
      null,
    ]) {
      row = changed;
      await expect(refreshAccessToken(login.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    }
  });

  test('dashboard accepts a new session; route failures do not become false logout errors', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('t' as never, ((key: string) => key) as never); await next(); });
    app.use('*', authMiddleware);
    app.onError((_error, c) => c.json({ error: 'Service failure' }, 500));
    app.get('/dashboard', (c) => c.json({ ok: true }));
    app.get('/failure', () => { throw new Error('test infrastructure failure'); });
    const login = await adminLogin(fixture.phoneNumber, fixturePassword);
    const headers = { Authorization: `Bearer ${login.accessToken}` };
    expect((await app.request('/dashboard', { headers })).status).toBe(200);
    expect((await app.request('/failure', { headers })).status).toBe(500);

    const legacyToken = await signAccessToken({ sub: fixture.id, phone: fixture.phoneNumber, role: 'owner' });
    const denied = await app.request('/dashboard', { headers: { Authorization: `Bearer ${legacyToken}` } });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ error: 'admin.sessionRevoked' });
  });
});
