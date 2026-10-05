import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:9/no_network';
process.env.JWT_ACCESS_SECRET = 'test-only-access-security-http-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-security-http-0123456789';
process.env.DEMO_OTP_ENABLED = 'false';
process.env.MOCK_PAYMENTS = 'false';
process.env.CORS_ORIGINS = 'http://localhost:5355,http://localhost:4345,capacitor://localhost';

const admin = { id: 'b277bdde-28cf-4e55-a5bd-7ec5cb81a4ea', role: 'owner' as 'owner' | 'moderator',
  sessionVersion: 0, phoneNumber: '+251900000000', passwordHash: 'unused', fullName: null,
  createdAt: new Date(), updatedAt: new Date() };
let currentAdmin: typeof admin | null = { ...admin };
const adminQueries = await import('../src/db/queries/admin.queries.js');
mock.module('../src/db/queries/admin.queries.js', () => ({ ...adminQueries, findAdminById: async () => currentAdmin }));
mock.module('../src/lib/health.js', () => ({ getCachedHealthReport: async () => ({
  status: 'error', timestamp: '2026-10-05', checks: { database: { status: 'error', message: 'private-db-secret', detail: { postgresVersion: 'private-version' } } },
}) }));
const serverConfig = (await import('../src/index.js')).default;
const { sql } = await import('../src/db/client.js');
const { signAccessToken } = await import('../src/lib/jwt.js');
const { broadcastTicketsSold } = await import('../src/lib/ticket-broadcast.js');
const raffleId = '83d2b6a9-3784-49e3-bcc2-71a88ec79903';
let handshakeFailure = '';
const server = Bun.serve({ ...serverConfig, hostname: '127.0.0.1', port: 0,
  async fetch(request, bunServer) {
    const response = await serverConfig.fetch(request, bunServer);
    if (request.headers.get('upgrade') === 'websocket' && response.status !== 200) {
      handshakeFailure = `${response.status}: ${await response.clone().text()}`;
    }
    return response;
  },
});
const base = `http://127.0.0.1:${server.port}`;
const origin = 'http://localhost:5355';
beforeEach(() => { currentAdmin = { ...admin }; });
afterAll(async () => { server.stop(true); mock.restore(); await sql.end(); });

async function adminToken() {
  return signAccessToken({ sub: admin.id, role: 'owner', phone: admin.phoneNumber, sessionVersion: 0 });
}

describe('HTTP security boundaries', () => {
  test('cross-site and missing-origin cookie requests fail before accessing the database', async () => {
    for (const path of ['/auth/logout', '/auth/refresh', '/auth/otp/verify', '/auth/telegram/oidc']) {
      for (const badOrigin of [undefined, 'null', 'https://evil.example']) {
        const response = await fetch(`${base}${path}`, {
          method: 'POST', headers: badOrigin ? { Origin: badOrigin } : {}, body: 'form=value',
        });
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('ORIGIN_NOT_ALLOWED');
      }
    }
  });
  test('configured browser and Capacitor origins can clear an empty user session', async () => {
    for (const allowedOrigin of [origin, 'capacitor://localhost']) {
      const response = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: allowedOrigin } });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('refresh_token=');
    }
  });
  test('public health cannot reveal DB errors and private diagnostics are owner-only', async () => {
    for (const path of ['/health', '/health/db']) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).not.toContain('private-db-secret');
      expect(body).not.toContain('postgresVersion');
    }
    expect((await fetch(`${base}/admin/health`)).status).toBe(401);
    const token = await adminToken();
    expect((await fetch(`${base}/admin/health`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    currentAdmin = { ...admin, role: 'moderator' };
    const moderatorToken = await signAccessToken({ sub: admin.id, phone: admin.phoneNumber, role: 'moderator', sessionVersion: 0 });
    expect((await fetch(`${base}/admin/health`, { headers: { Authorization: `Bearer ${moderatorToken}` } })).status).toBe(403);
  });
});

describe('actual admin WebSocket handshake and revocation', () => {
  test('header ticket connects, receives updates, then rejects revoked sessions', async () => {
    const token = await adminToken();
    const response = await fetch(`${base}/admin/raffles/${raffleId}/ticket-updates/ticket`, {
      method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const { ticket } = await response.json();
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/admin/raffles/${raffleId}/ticket-updates`, {
      protocols: [`ticket.${ticket}`], headers: { Origin: origin },
    });
    try {
      await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = (event) => reject(new Error(`WebSocket handshake failed: ${(event as ErrorEvent).message}; ${handshakeFailure}`)); });
      const received = new Promise<string>((resolve) => { ws.onmessage = (event) => resolve(String(event.data)); });
      await broadcastTicketsSold(raffleId, [{ number: 1, displayNumber: '000001' }]);
      expect(await received).toContain('000001');
      const closed = new Promise<number>((resolve) => { ws.onclose = (event) => resolve(event.code); });
      currentAdmin = { ...admin, sessionVersion: 1 };
      await broadcastTicketsSold(raffleId, [{ number: 2, displayNumber: '000002' }]);
      expect(await closed).toBe(1008);
      const replay = await fetch(`${base}/admin/raffles/${raffleId}/ticket-updates`, {
        headers: { Origin: origin, 'Sec-WebSocket-Protocol': `ticket.${ticket}` },
      });
      expect(replay.status).toBe(401);
      const oldUrlToken = await fetch(`${base}/admin/raffles/${raffleId}/ticket-updates?token=${token}`, { headers: { Origin: origin } });
      expect(oldUrlToken.status).toBe(401);
    } finally { ws.close(); }
  }, 10000);
});
