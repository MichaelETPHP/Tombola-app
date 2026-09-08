/** Shared by access-token and refresh-token checks. Missing versions fail closed. */
export function isCurrentAdminSession(
  payload: { sub: string; role: string; sessionVersion?: number },
  admin: { id: string; role: string; sessionVersion: number } | null,
): boolean {
  return Boolean(admin && (payload.role === 'owner' || payload.role === 'moderator')
    && admin.id === payload.sub && admin.role === payload.role
    && Number.isSafeInteger(payload.sessionVersion)
    && payload.sessionVersion === admin.sessionVersion);
}
