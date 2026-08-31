import { writable } from 'svelte/store';

export interface AdminUser {
  id: string;
  phone?: string;
  email: string;
  fullName: string | null;
  role: 'owner' | 'moderator';
  createdAt?: string;
}

interface AuthState {
  accessToken: string | null;
  admin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  admin: null,
  isAuthenticated: false,
  isLoading: true,
};

/**
 * Auth store — access token lives in memory only (not localStorage).
 * Refresh token is managed via httpOnly cookie by the API.
 */
export const auth = writable<AuthState>(initialState);

export function setAuth(accessToken: string, admin: AdminUser): void {
  auth.set({
    accessToken,
    admin,
    isAuthenticated: true,
    isLoading: false,
  });
}

export function clearAuth(): void {
  auth.set({
    accessToken: null,
    admin: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

export function setAuthLoading(loading: boolean): void {
  auth.update((state) => ({ ...state, isLoading: loading }));
}

/** Patch the signed-in admin's own profile in the store after a self-edit — no re-login needed. */
export function updateOwnAdminInStore(admin: AdminUser): void {
  auth.update((state) => ({ ...state, admin }));
}
