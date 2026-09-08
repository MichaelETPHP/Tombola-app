import { afterEach, beforeEach, describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, clearAuth } from '../../admin-app/src/lib/stores/auth.store.js';
import { loginAdmin, restoreAdminSession } from '../../admin-app/src/lib/api/client.js';

function authState() {
  let state: { isAuthenticated: boolean; accessToken: string | null } | undefined;
  const unsubscribe = auth.subscribe((value) => { state = value; });
  unsubscribe();
  return state!;
}

const originalFetch = globalThis.fetch;
const admin = { id: 'test-admin', email: 'fixture@example.test', fullName: 'Fixture', role: 'owner' };
const credentials = { phone: '+251900000000', password: 'fixture-only-password' };
const reply = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => { clearAuth(); });
afterEach(() => { globalThis.fetch = originalFetch; clearAuth(); });

describe('admin login handoff', () => {
  test('does not authenticate until the API confirms the issued token', async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      paths.push(new URL(url).pathname);
      assert.equal(authState().isAuthenticated, false);
      if (url.endsWith('/login')) return reply({ accessToken: 'new-token', admin });
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new-token');
      assert.equal(init?.credentials, 'include');
      return reply({ admin });
    }) as typeof fetch;
    await loginAdmin(credentials);
    assert.deepEqual(paths, ['/admin/auth/login', '/admin/auth/me']);
    assert.equal(authState().accessToken, 'new-token');
    assert.equal(authState().isAuthenticated, true);
  });

  test('the reported login-200/me-401 failure never mounts the dashboard', async () => {
    globalThis.fetch = (async (url: string) => url.endsWith('/login')
      ? reply({ accessToken: 'unusable-token', admin })
      : reply({ error: 'Session rejected', code: 'AUTH_SESSION_REVOKED' }, 401)) as typeof fetch;
    await assert.rejects(loginAdmin(credentials), { code: 'AUTH_SESSION_SETUP_FAILED', status: 503 });
    assert.equal(authState().isAuthenticated, false);
    assert.equal(authState().accessToken, null);
  });

  test('an earlier unauthenticated refresh cannot clear a completed login', async () => {
    let finishRefresh!: (response: Response) => void;
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith('/refresh')) return new Promise<Response>((resolve) => { finishRefresh = resolve; });
      if (url.endsWith('/login')) return reply({ accessToken: 'new-token', admin });
      return reply({ admin });
    }) as typeof fetch;
    const initialRefresh = restoreAdminSession();
    await loginAdmin(credentials);
    finishRefresh(reply({ error: 'No cookie' }, 401));
    await initialRefresh;
    assert.equal(authState().isAuthenticated, true);
    assert.equal(authState().accessToken, 'new-token');
  });

  test('concurrent session restoration uses one refresh request', async () => {
    let refreshCount = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith('/refresh')) { refreshCount++; return reply({ accessToken: 'restored-token' }); }
      return reply({ admin });
    }) as typeof fetch;
    await Promise.all([restoreAdminSession(), restoreAdminSession(), restoreAdminSession()]);
    assert.equal(refreshCount, 1);
    assert.equal(authState().accessToken, 'restored-token');
  });
});
