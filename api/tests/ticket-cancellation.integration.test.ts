import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';

// Run separately against an explicitly supplied disposable local PostgreSQL:
// TICKET_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres
// bun test tests/ticket-cancellation.integration.test.ts
const databaseUrl = process.env.TICKET_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const schema = `ticket_cancel_test_${crypto.randomUUID().replaceAll('-', '')}`;
let sql: typeof import('../src/db/client.js').sql;
let queries: typeof import('../src/db/queries/payments.queries.js');
let getAvailability: typeof import('../src/db/queries/ticket-availability.queries.js').getTicketAvailability;
let cancelForUser: typeof import('../src/modules/payments/payments.service.js').cancelPaymentForUser;
let adminId = '';
let fixtureNumber = 0;

suite('ticket cancellation with real PostgreSQL locks and claims', () => {
  beforeAll(async () => {
    if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('Use a disposable local PostgreSQL instance');
    process.env.DATABASE_URL = databaseUrl;
    process.env.DB_SCHEMA = schema;
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-only-access-key-for-cancellation-012345';
    process.env.JWT_REFRESH_SECRET = 'test-only-refresh-key-for-cancellation-012345';
    ({ sql } = await import('../src/db/client.js'));
    const migrations = new URL('../src/db/Migration/', import.meta.url);
    const { default: postgres } = await import('postgres');
    const migrationClient = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    try {
      await migrationClient`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`;
      for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql') && !name.startsWith('002_')).sort()) {
        const source = (await Bun.file(new URL(name, migrations)).text()).replaceAll('Tombola_DB', schema);
        await migrationClient.unsafe(source);
      }
    } finally { await migrationClient.end(); }
    queries = await import('../src/db/queries/payments.queries.js');
    ({ getTicketAvailability: getAvailability } = await import('../src/db/queries/ticket-availability.queries.js'));
    ({ cancelPaymentForUser: cancelForUser } = await import('../src/modules/payments/payments.service.js'));
    const [admin] = await sql`INSERT INTO admin_users (phone_number, password_hash, role) VALUES ('+251911111111', 'unused-test-hash', 'owner') RETURNING id`;
    adminId = admin.id;
  }, 30000);

  afterAll(async () => {
    if (!sql) return;
    // Only remove this run's uniquely named test schema, never application data.
    if (/^ticket_cancel_test_[a-f0-9]{32}$/.test(schema)) await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end();
  });

  async function fixture() {
    const n = ++fixtureNumber;
    const [raffle] = await sql`INSERT INTO raffles (title, prize_name, prize_value, ticket_price, ticket_cap,
      max_tickets_per_user, deadline_days, deadline_at, status, created_by, category_code, raffle_number, public_code)
      VALUES ('Cancellation test', 'Test prize', 100, 10, 120, 5, 7, NOW() + INTERVAL '7 days', 'open', ${adminId}, 'TST', ${n}, ${`TST-${String(n).padStart(3, '0')}`}) RETURNING id`;
    const users = await sql`INSERT INTO users (phone_number) VALUES (${`+25192${String(n * 2).padStart(7, '0')}`}), (${`+25192${String(n * 2 + 1).padStart(7, '0')}`}) RETURNING id`;
    return { raffleId: raffle.id as string, userId: users[0].id as string, otherId: users[1].id as string };
  }

  async function reserve(raffleId: string, userId: string, numbers = [7, 25]) {
    const result = await queries.reservePayment({ raffleId, userId, gateway: 'chapa', gatewayRef: `TEST-${crypto.randomUUID()}`,
      ticketCount: numbers.length, selectedNumbers: numbers, idempotencyKey: crypto.randomUUID() });
    if (!result.ok) throw new Error(result.reason);
    return result.payment;
  }

  test('started checkout cancellation frees numbers and allowance immediately', async () => {
    const f = await fixture();
    const payment = await reserve(f.raffleId, f.userId);
    await queries.startPaymentCheckout(payment.id, f.userId);
    expect((await cancelForUser(payment.id, f.userId)).status).toBe('failed');
    const availability = await getAvailability(f.raffleId, f.userId, 1, 60);
    expect(availability.activePaymentId).toBeNull();
    expect(availability.allowance).toBe(5);
    expect(availability.numbers.find((n) => n.number === 7)?.state).toBe('available');
    const next = await reserve(f.raffleId, f.otherId);
    expect(next.selectedNumbers).toEqual([7, 25]);
  });

  test('the same user can choose again with a fresh checkout', async () => {
    const f = await fixture();
    const original = await reserve(f.raffleId, f.userId);
    await cancelForUser(original.id, f.userId);
    const next = await reserve(f.raffleId, f.userId);
    expect(next.id).not.toBe(original.id);
  });

  test('another user cannot cancel someone else’s reservation', async () => {
    const f = await fixture();
    const payment = await reserve(f.raffleId, f.userId);
    const result = await cancelForUser(payment.id, f.otherId).catch((error: Error) => error);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Payment not found');
    expect((await queries.findPaymentById(payment.id))?.status).toBe('pending');
  });

  test('cancellation is idempotent and never releases a subsequent buyer’s claim', async () => {
    const f = await fixture();
    const old = await reserve(f.raffleId, f.userId);
    await cancelForUser(old.id, f.userId);
    const next = await reserve(f.raffleId, f.otherId);
    await cancelForUser(old.id, f.userId);
    const claims = await sql`SELECT payment_id FROM ticket_number_claims WHERE raffle_id = ${f.raffleId}`;
    expect(claims.length).toBe(2);
    expect(claims.every((row) => row.paymentId === next.id)).toBe(true);
  });

  test('completed tickets cannot be cancelled or released', async () => {
    const f = await fixture();
    const payment = await reserve(f.raffleId, f.userId);
    expect(await queries.completePaymentAndIssueTickets(payment.gatewayRef!)).toBe('completed');
    expect((await cancelForUser(payment.id, f.userId)).status).toBe('completed');
    expect((await getAvailability(f.raffleId, f.otherId, 1, 60)).numbers.find((n) => n.number === 7)?.state).toBe('sold');
  });

  test('late success goes to review and cannot take numbers from the new buyer', async () => {
    const f = await fixture();
    const old = await reserve(f.raffleId, f.userId);
    await queries.startPaymentCheckout(old.id, f.userId);
    await cancelForUser(old.id, f.userId);
    const next = await reserve(f.raffleId, f.otherId);
    expect(await queries.completePaymentAndIssueTickets(old.gatewayRef!)).toBe('review');
    expect(await queries.completePaymentAndIssueTickets(next.gatewayRef!)).toBe('completed');
    const tickets = await sql`SELECT user_id FROM tickets WHERE raffle_id = ${f.raffleId}`;
    expect(tickets.length).toBe(2);
    expect(tickets.every((row) => row.userId === f.otherId)).toBe(true);
  });

  test('payment-success/cancel race has one consistent outcome', async () => {
    const f = await fixture();
    const payment = await reserve(f.raffleId, f.userId);
    await queries.startPaymentCheckout(payment.id, f.userId);
    await Promise.all([queries.completePaymentAndIssueTickets(payment.gatewayRef!), cancelForUser(payment.id, f.userId)]);
    const final = await queries.findPaymentById(payment.id);
    const tickets = await sql`SELECT id FROM tickets WHERE payment_id = ${payment.id}`;
    const claims = await sql`SELECT sold FROM ticket_number_claims WHERE payment_id = ${payment.id}`;
    if (final?.status === 'completed') {
      expect(tickets.length).toBe(2);
      expect(claims.length).toBe(2);
      expect(claims.every((c) => c.sold)).toBe(true);
    } else {
      expect(final?.reviewRequired).toBe(true);
      expect(tickets.length).toBe(0);
      expect(claims.length).toBe(0);
    }
  });
});
