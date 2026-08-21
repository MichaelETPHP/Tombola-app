import { get } from 'svelte/store';
import { auth, setAuth, clearAuth } from '../stores/auth.store.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * API client with automatic auth header injection and 401 → refresh flow.
 * Mirrors mobile-app's client — each project is independent, so this is a
 * deliberate small duplication rather than a shared package.
 */
async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);

  if (!headers.has('Content-Type') && fetchOptions.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const authState = get(auth);
    if (authState.accessToken) {
      headers.set('Authorization', `Bearer ${authState.accessToken}`);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !skipAuth) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
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
      throw new ApiError(401, 'Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ApiError(response.status, errorBody);
  }

  return response.json() as Promise<T>;
}

async function attemptRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) return false;

    const data = (await response.json()) as { accessToken: string };
    const authState = get(auth);
    if (!authState.admin) return false;

    setAuth(data.accessToken, authState.admin);
    return true;
  } catch {
    return false;
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
