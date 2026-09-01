import { writable } from 'svelte/store';
import { tickets } from './tickets.store.js';
import { payouts } from './wins.store.js';
import { payments } from './payments.store.js';

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    phone: string;
    fullName: string | null;
    preferredLanguage?: 'en' | 'am';
    telegramLinked?: boolean;
    telegramUsername?: string | null;
    telegramPhotoUrl?: string | null;
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
 * Clear auth state on logout or token expiry. Also wipes the per-user
 * session caches (tickets/wins/payments) — without this, a second person
 * logging in on the same device right after would briefly see the
 * previous user's cached list before the background refetch overwrites
 * it, since those stores otherwise live for the whole app session.
 */
export function clearAuth(): void {
  auth.set({
    accessToken: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
  tickets.set([]);
  payouts.set([]);
  payments.set([]);
}

/**
 * Set loading state (e.g., during token refresh on app mount).
 */
export function setAuthLoading(loading: boolean): void {
  auth.update((state) => ({ ...state, isLoading: loading }));
}
