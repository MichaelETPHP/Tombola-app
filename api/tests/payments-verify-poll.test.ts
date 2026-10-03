import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:9/no_network';
process.env.JWT_ACCESS_SECRET ||= 'test-only-access-secret-for-verify-poll-012345';
process.env.JWT_REFRESH_SECRET ||= 'test-only-refresh-secret-for-verify-poll-012345';

const basePayment = {
  id: 'payment-1',
  userId: 'user-1',
  raffleId: 'raffle-1',
  ticketCount: 1,
  amount: 100,
  gateway: 'chapa' as const,
  gatewayRef: 'TXN-verify-poll',
  status: 'pending' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  selectedNumbers: [1],
  reservationExpiresAt: null,
  checkoutStartedAt: new Date(),
  idempotencyKey: null,
  reviewRequired: false,
  chapaReference: null,
  paymentMethod: null,
  raffleTitle: 'Test raffle',
  categoryCode: 'A',
  numberBlockStart: null,
  ticketNumbers: [],
  ticketDisplayNumbers: [],
  phoneNumber: '0912345678',
  telegramUserId: null,
};

const queries = await import('../src/db/queries/payments.queries.js');
const gateway = await import('../src/lib/payment-gateway.js');
mock.module('../src/db/queries/payments.queries.js', () => ({
  ...queries,
  findPaymentReceiptById: mock(async () => basePayment),
  findPaymentByTxRef: mock(async () => basePayment),
}));

let verifyMock = mock(async () => { throw new gateway.ChapaVerifyError(404, 'not found'); });
mock.module('../src/lib/payment-gateway.js', () => ({
  ...gateway,
  chapaVerify: (...args: Parameters<typeof gateway.chapaVerify>) => verifyMock(...args),
}));

const { verifyPaymentForUser } = await import('../src/modules/payments/payments.service.js');

beforeEach(() => { verifyMock = mock(async () => { throw new gateway.ChapaVerifyError(404, 'not found'); }); });
afterEach(() => { mock.restore(); });
afterAll(() => {
  mock.module('../src/db/queries/payments.queries.js', () => queries);
  mock.module('../src/lib/payment-gateway.js', () => gateway);
});

describe('user-facing verify poll during a pending direct charge', () => {
  test('a ChapaVerifyError (tx_ref not yet recognized) does not fail the poll', async () => {
    const result = await verifyPaymentForUser(basePayment.id, basePayment.userId);
    expect(result.status).toBe('pending');
  });

  test('a non-gateway error still propagates', async () => {
    verifyMock = mock(async () => { throw new Error('unexpected'); });
    await expect(verifyPaymentForUser(basePayment.id, basePayment.userId)).rejects.toThrow('unexpected');
  });
});
