export class ApiError extends Error {
  readonly retryAfterSeconds?: number;
  readonly code?: string;

  constructor(public status: number, public body: string, retryAfter?: string | null) {
    super(`API Error ${status}: ${body}`);
    this.name = 'ApiError';
    let payload: { retryAfter?: unknown; code?: string } = {};
    try { payload = JSON.parse(body) ?? {}; } catch { /* Non-JSON errors still use the response header. */ }
    this.code = payload.code;
    const bodySeconds = typeof payload.retryAfter === 'number'
      || (typeof payload.retryAfter === 'string' && payload.retryAfter.trim())
      ? Number(payload.retryAfter) : NaN;
    const headerSeconds = retryAfter?.trim()
      ? /^\d+(\.\d+)?$/.test(retryAfter.trim())
        ? Number(retryAfter)
        : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000)
      : NaN;
    const seconds = Number.isFinite(headerSeconds) ? headerSeconds : bodySeconds;
    if (Number.isFinite(seconds) && seconds >= 0) this.retryAfterSeconds = Math.ceil(seconds);
  }
}
