import { AppError } from '../middleware/error-handler.middleware.js';

/** Do not silently serialize an undefined version out of an otherwise valid JWT. */
export function requireAdminSessionVersion(version: unknown): number {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new AppError(503, 'admin.sessionUnavailable');
  }
  return version;
}

/** Shared by access-token and refresh-token checks. Missing versions fail closed. */
export function isCurrentAdminSession(
  payload: { sub: string; role: string; sessionVersion?: number },
  admin: { id: string; role: string; sessionVersion: number } | null,
): boolean {
  return Boolean(admin && (payload.role === 'owner' || payload.role === 'moderator')
    && admin.id === payload.sub && admin.role === payload.role
    && Number.isSafeInteger(payload.sessionVersion) && payload.sessionVersion! >= 0
    && payload.sessionVersion === admin.sessionVersion);
}
