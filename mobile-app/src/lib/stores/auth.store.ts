import { writable } from 'svelte/store';

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    phone: string;
    fullName: string | null;
  } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

/**
 * Auth store — access token lives in memory only (not localStorage).
 * Refresh token is managed via httpOnly cookie by the API.
 */
export const auth = writable<AuthState>(initialState);

/**
 * Set auth state after successful login or token refresh.
 */
export function setAuth(accessToken: string, user: AuthState['user']): void {
  auth.set({
    accessToken,
    user,
    isAuthenticated: true,
    isLoading: false,
  });
}

/**
 * Clear auth state on logout or token expiry.
 */
export function clearAuth(): void {
  auth.set({
    accessToken: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

/**
 * Set loading state (e.g., during token refresh on app mount).
 */
export function setAuthLoading(loading: boolean): void {
  auth.update((state) => ({ ...state, isLoading: loading }));
}
