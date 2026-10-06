import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:9/no_network';
process.env.JWT_ACCESS_SECRET ||= 'test-only-access-secret-for-mobile-charge-012345';
process.env.JWT_REFRESH_SECRET ||= 'test-only-refresh-secret-for-mobile-charge-012345';
const { env: testEnv } = await import('../src/config/env.js');
const originalConfig = { MOCK_PAYMENTS: testEnv.MOCK_PAYMENTS, CHAPA_SECRET_KEY: testEnv.CHAPA_SECRET_KEY };
const integrationLog = await import('../src/lib/integration-log.js');
const logEvent = mock((..._args: Parameters<typeof integrationLog.logIntegrationEvent>) => undefined);
mock.module('../src/lib/integration-log.js', () => ({ ...integrationLog, logIntegrationEvent: logEvent }));
const { chapaChargeMobile } = await import('../src/lib/payment-gateway.js');
const originalFetch = globalThis.fetch;
beforeEach(() => { logEvent.mockClear(); testEnv.MOCK_PAYMENTS = false; testEnv.CHAPA_SECRET_KEY = 'test-only-secret'; });
afterEach(() => { globalThis.fetch = originalFetch; Object.assign(testEnv, originalConfig); });
afterAll(() => { mock.module('../src/lib/integration-log.js', () => integrationLog); });

describe('server mobile money transport', () => {
  test('uses the documented charge API with server credentials for every supported method', async () => {
    for (const method of ['telebirr', 'cbebirr', 'ebirr', 'mpesa'] as const) {
      let capturedUrl = '';
      let captured: RequestInit | undefined;
      globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
        capturedUrl = String(url);
        captured = options;
        return Response.json({ status: 'success' });
      }) as unknown as typeof fetch;
      await chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method });
      expect(capturedUrl).toBe(`https://api.chapa.co/v1/charges?type=${method}`);
      expect(new Headers(captured?.headers).get('Authorization')).toBe('Bearer test-only-secret');
      const body = captured?.body as FormData;
      expect(body.get('amount')).toBe('250');
      expect(body.get('currency')).toBe('ETB');
      expect(body.get('mobile')).toBe('0912345678');
      expect(body.get('tx_ref')).toBe('TEST-charge');
    }
  });

  test('accepts a pending response — Chapa dispatches the phone approval asynchronously', async () => {
    globalThis.fetch = mock(async () => Response.json({ status: 'pending' })) as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' }))
      .resolves.toBeUndefined();
  });

  test('rejects gateway failures instead of reporting a successful submission', async () => {
    globalThis.fetch = mock(async () => Response.json({ status: 'failed' }, { status: 400 })) as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' }))
      .rejects.toThrow('Chapa mobile charge was not accepted');
  });

  test('mock mode cannot send a real charge', async () => {
    testEnv.MOCK_PAYMENTS = true;
    const fetchMock = mock(async () => Response.json({ status: 'success' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' }))
      .rejects.toThrow('Direct charges are unavailable in mock payment mode');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('records gateway rejection details for diagnosis', async () => {
    globalThis.fetch = mock(async () => Response.json({ status: 'failed', message: 'Invalid API key' }, { status: 401 })) as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' })).rejects.toThrow();
    expect(logEvent).toHaveBeenCalledWith('chapa', 'error', 'charge', {
      txRef: 'TEST-charge', method: 'telebirr', httpStatus: 401, status: 'failed', message: 'Invalid API key',
    });
  });

  test('records non-JSON gateway failures without treating them as accepted', async () => {
    globalThis.fetch = mock(async () => new Response('Bad Gateway', { status: 502 })) as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' })).rejects.toThrow('invalid charge response');
    expect(logEvent).toHaveBeenCalledWith('chapa', 'error', 'charge', {
      txRef: 'TEST-charge', method: 'telebirr', httpStatus: 502, reason: 'Invalid gateway JSON response',
    });
  });

  test('records a timeout without retrying a potentially accepted charge', async () => {
    const fetchMock = mock(async () => { throw new DOMException('Timed out', 'TimeoutError'); });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(chapaChargeMobile({ amount: 250, mobile: '0912345678', txRef: 'TEST-charge', method: 'telebirr' })).rejects.toThrow('Timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith('chapa', 'error', 'charge', {
      txRef: 'TEST-charge', method: 'telebirr', reason: 'TimeoutError',
    });
  });
});
