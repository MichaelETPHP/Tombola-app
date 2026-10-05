import { describe, expect, spyOn, test } from 'bun:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:9/no_network';
process.env.JWT_ACCESS_SECRET = 'test-only-access-security-policy-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-security-policy-0123456789';
const { envSchema } = await import('../src/config/env.js');
const { issueWebSocketTicket, consumeWebSocketTicket } = await import('../src/lib/websocket-ticket.js');

const production = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:unused@db.example.com/db',
  JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64),
  API_BASE_URL: 'https://api.example.com', MOBILE_APP_URL: 'https://app.example.com',
  CORS_ORIGINS: 'https://admin.example.com, https://app.example.com,capacitor://localhost',
};

describe('production safety policy', () => {
  test('secure defaults permit production and trim exact trusted origins', () => {
    const parsed = envSchema.parse(production);
    expect(parsed.DB_SSL).toBe(true);
    expect(parsed.DEMO_OTP_ENABLED).toBe(false);
    expect(parsed.MOCK_PAYMENTS).toBe(false);
    expect(parsed.CORS_ORIGINS).toContain('https://app.example.com');
  });
  test('production refuses demo OTP, mock charges, plaintext DB and reused keys', () => {
    for (const unsafe of [{ DEMO_OTP_ENABLED: 'true' }, { MOCK_PAYMENTS: 'true' },
      { DB_SSL: 'false' }, { JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET },
      { API_BASE_URL: 'http://api.example.com' }, { API_BASE_URL: 'invalid' }, { CORS_ORIGINS: '*' }]) {
      expect(envSchema.safeParse({ ...production, ...unsafe }).success).toBe(false);
    }
  });
  test('private development can explicitly opt into mock features', () => {
    expect(envSchema.safeParse({ ...production, NODE_ENV: 'development', DEMO_OTP_ENABLED: 'true', MOCK_PAYMENTS: 'true', DB_SSL: 'false' }).success).toBe(true);
  });
});

describe('one-use scoped WebSocket tickets', () => {
  const payload = { sub: 'admin', role: 'owner' as const, phone: '+251900000000',
    type: 'access' as const, sessionVersion: 2, exp: Math.floor(Date.now() / 1000) + 60 };
  test('a ticket works once for its raffle and exact browser origin', () => {
    const ticket = issueWebSocketTicket(payload, 'raffle', 'https://admin.example.com');
    expect(consumeWebSocketTicket(ticket, 'raffle', 'https://admin.example.com')?.sub).toBe('admin');
    expect(consumeWebSocketTicket(ticket, 'raffle', 'https://admin.example.com')).toBeNull();
  });
  test('wrong scope burns the ticket, and expired access cannot mint one', () => {
    const ticket = issueWebSocketTicket(payload, 'raffle', 'https://admin.example.com');
    expect(consumeWebSocketTicket(ticket, 'other', 'https://admin.example.com')).toBeNull();
    expect(consumeWebSocketTicket(ticket, 'raffle', 'https://admin.example.com')).toBeNull();
    const wrongOrigin = issueWebSocketTicket(payload, 'raffle', 'https://admin.example.com');
    expect(consumeWebSocketTicket(wrongOrigin, 'raffle', 'https://evil.example')).toBeNull();
    expect(() => issueWebSocketTicket({ ...payload, exp: 1 }, 'raffle', 'https://admin.example.com')).toThrow();
  });
  test('unredeemed tickets expire after 30 seconds', () => {
    const ticket = issueWebSocketTicket(payload, 'raffle', 'https://admin.example.com');
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    try { expect(consumeWebSocketTicket(ticket, 'raffle', 'https://admin.example.com')).toBeNull(); }
    finally { clock.mockRestore(); }
  });
});
