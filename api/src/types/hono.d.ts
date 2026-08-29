import type { Context } from 'hono';
import type { TFunction } from 'i18next';
import type { Locale } from '../lib/i18n.js';

/**
 * Authenticated user payload attached to Hono context by auth middleware.
 */
export interface AuthUser {
  id: string;
  phone: string;
  role: 'user';
}

/**
 * Authenticated admin payload attached to Hono context by auth middleware.
 */
export interface AuthAdmin {
  id: string;
  role: 'owner' | 'moderator';
}

/**
 * Extended Hono environment variables type.
 * Use this as the Env generic parameter for Hono routes.
 */
export interface AppEnv {
  Variables: {
    user: AuthUser;
    admin: AuthAdmin;
    locale: Locale;
    t: TFunction;
    requestId: string;
  };
}

/**
 * Convenience type for route handlers with the app environment.
 */
export type AppContext = Context<AppEnv>;
