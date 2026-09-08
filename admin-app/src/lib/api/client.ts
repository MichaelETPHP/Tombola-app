import { get } from 'svelte/store';
import { auth, setAuth, clearAuth, getSessionRevision, invalidateSessionWork } from '../stores/auth.store.js';
import type { AdminUser } from '../stores/auth.store.js';

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3435').replace(/\/+$/, '');
interface FetchOptions extends RequestInit { skipAuth?: boolean }
let refreshPromise: Promise<boolean> | undefined;
let signingOut = false;

export class ApiError extends Error {
  code?: string;
  retryAfter?: number;
  constructor(public status: number, public body: string) {
    let message = status >= 500 ? 'The service is unavailable. Please try again.' : 'The request could not be completed.';
    let parsed: { error?: string; code?: string; retryAfter?: number } = {};
    try {
      parsed = JSON.parse(body);
      if (status < 500 && typeof parsed?.error === 'string') message = parsed.error;
    } catch { /* Never display raw HTML, traces, or proxy responses. */ }
    super(message);
    this.name = 'ApiError';
    this.code = parsed?.code;
    this.retryAfter = parsed?.retryAfter;
  }
}

/** Bound every request, including refresh and uploads. Honor component cancellation. */
async function request(path: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, options.body instanceof FormData ? 60_000 : 20_000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options, signal: controller.signal, credentials: 'include', cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(controller.signal.aborted ? 408 : 0, JSON.stringify({
      error: controller.signal.aborted
        ? 'The request timed out. Please try again.'
        : 'Unable to connect. Check your connection and try again.',
    }));
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new ApiError(response.status, await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** One refresh serves concurrent requests; a late response cannot undo logout/login. */
export function restoreAdminSession(): Promise<boolean> {
  if (signingOut) return Promise.resolve(false);
  if (refreshPromise) return refreshPromise;
  const revision = getSessionRevision();
  const pending = (async () => {
    try {
      const result = await readResponse<{ accessToken: string }>(await request('/admin/auth/refresh', { method: 'POST' }));
      const { admin } = await readResponse<{ admin: AdminUser }>(await request('/admin/auth/me', {
        headers: { Authorization: `Bearer ${result.accessToken}` },
      }));
      if (revision !== getSessionRevision() || signingOut) return get(auth).isAuthenticated;
      setAuth(result.accessToken, admin);
      return true;
    } catch (error) {
      if (revision !== getSessionRevision()) return get(auth).isAuthenticated;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearAuth();
        return false;
      }
      throw error;
    }
  })();
  refreshPromise = pending;
  void pending.finally(() => { if (refreshPromise === pending) refreshPromise = undefined; }).catch(() => {});
  return pending;
}

/** Verify the issued session before marking sign-in complete or mounting protected pages. */
export async function loginAdmin(credentials: { phone: string; password: string }): Promise<void> {
  invalidateSessionWork();
  const revision = getSessionRevision();
  const result = await readResponse<{ accessToken: string }>(await request('/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
  }));
  if (typeof result.accessToken !== 'string' || !result.accessToken) {
    throw new ApiError(502, JSON.stringify({ code: 'AUTH_SESSION_SETUP_FAILED' }));
  }
  const response = await request('/admin/auth/me', {
    headers: { Authorization: `Bearer ${result.accessToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(503, JSON.stringify({ code: 'AUTH_SESSION_SETUP_FAILED' }));
  }
  const { admin } = await readResponse<{ admin: AdminUser }>(response);
  if (!admin?.id || !['owner', 'moderator'].includes(admin.role)) {
    throw new ApiError(502, JSON.stringify({ code: 'AUTH_SESSION_SETUP_FAILED' }));
  }
  if (revision !== getSessionRevision() || signingOut) {
    throw new ApiError(409, JSON.stringify({ error: 'This sign-in was superseded. Please try again.' }));
  }
  setAuth(result.accessToken, admin);
}

export async function logoutAdmin(): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  invalidateSessionWork();
  try {
    await readResponse(await request('/admin/auth/logout', { method: 'POST' }));
    clearAuth();
  } finally {
    signingOut = false;
  }
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, ...init } = options;
  if (!skipAuth && signingOut) throw new ApiError(401, JSON.stringify({ error: 'Signing out.' }));
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const sentToken = get(auth).accessToken;
  if (!skipAuth && sentToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${sentToken}`);
  const response = await request(path, { ...init, headers });
  if (response.status !== 401 || skipAuth) return readResponse<T>(response);

  const error = new ApiError(401, await response.text());
  // A bad current password is a form error, not a reason to refresh the session.
  if (error.code === 'AUTH_INVALIDCREDENTIALS') throw error;
  const tokenChanged = get(auth).accessToken && get(auth).accessToken !== sentToken;
  if (!tokenChanged && !(await restoreAdminSession())) throw error;
  if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  headers.set('Authorization', `Bearer ${get(auth).accessToken}`);
  const retry = await request(path, { ...init, headers });
  if (retry.status === 401 && get(auth).accessToken === headers.get('Authorization')?.slice(7)) clearAuth();
  return readResponse<T>(retry);
}

export const api = {
  get: <T>(path: string, options?: FetchOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: FetchOptions) => apiFetch<T>(path, {
    ...options, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  }),
  patch: <T>(path: string, body?: unknown, options?: FetchOptions) => apiFetch<T>(path, {
    ...options, method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body),
  }),
  delete: <T>(path: string, body?: unknown, options?: FetchOptions) => apiFetch<T>(path, {
    ...options, method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body),
  }),
  upload: <T>(path: string, body: FormData, options?: FetchOptions) => apiFetch<T>(path, { ...options, method: 'POST', body }),
};
