import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types/hono.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Custom key extractor (defaults to IP + path) */
  keyExtractor?: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string;
}

/**
 * In-memory rate limiter middleware factory.
 * Suitable for single-instance deployments. For multi-instance,
 * replace with Redis-backed rate limiting.
 *
 * Usage:
 *   app.post('/auth/otp/request', rateLimit({ max: 5, windowSeconds: 300 }), handler)
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  const { max, windowSeconds, keyExtractor } = options;
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 60 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 60_000);

  return async (c, next) => {
    const key = keyExtractor
      ? keyExtractor(c)
      : `${c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'}:${c.req.path}`;

    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - entry.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', retryAfter.toString());

      return c.json(
        {
          error: c.get('t')('rate.tooMany'),
          code: 'RATE_LIMITED',
          retryAfter,
        },
        429
      );
    }

    await next();
  };
}
