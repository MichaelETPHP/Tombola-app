import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { auth, setAuth, clearAuth } from '../stores/auth.store.js';
import { language } from '../stores/language.store.js';
import { showBanner } from '../stores/banner.store.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3435';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * API client with automatic auth header injection and 401 → refresh flow.
 */
async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set('Accept-Language', get(language));

  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach auth header if authenticated
  if (!skipAuth) {
    const authState = get(auth);
    if (authState.accessToken) {
      headers.set('Authorization', `Bearer ${authState.accessToken}`);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include', // Include cookies for refresh token
  });

  // Handle 401 — attempt token refresh
  if (response.status === 401 && !skipAuth) {
    const refreshResult = await attemptRefresh();
    if (refreshResult.refreshed) {
      // Retry the original request with new token
      const authState = get(auth);
      headers.set('Authorization', `Bearer ${authState.accessToken}`);
      const retryResponse = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
      if (!retryResponse.ok) {
        throw new ApiError(retryResponse.status, await retryResponse.text());
      }
      return retryResponse.json() as Promise<T>;
    } else {
      clearAuth();
      // Single-device enforcement: this device's session was superseded by
      // a newer login elsewhere. Surface that plainly rather than leaving
      // the user stranded on a broken page wondering why requests fail.
      if (refreshResult.code === 'AUTH_SESSION_REVOKED') {
        showBanner("You've been logged out — this account signed in on another device.", 3000);
        goto('/login', { replaceState: true });
      }
      throw new ApiError(401, 'Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ApiError(response.status, errorBody);
  }

  return response.json() as Promise<T>;
}

/**
 * Attempt to refresh the access token using the httpOnly refresh cookie.
 */
async function attemptRefresh(): Promise<{ refreshed: boolean; code?: string }> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      return { refreshed: false, code: body?.code };
    }

    const data = await response.json() as { accessToken: string };
    const authState = get(auth);

    setAuth(data.accessToken, authState.user);
    return { refreshed: true };
  } catch {
    return { refreshed: false };
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`API Error ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

// ── Convenience methods ──────────────────────────────────

export const api = {
  get: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
