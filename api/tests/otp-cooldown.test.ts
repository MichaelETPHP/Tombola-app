import { afterEach, describe, expect, test } from 'bun:test';
import { ApiError } from '../../mobile-app/src/lib/api/error.ts';
import { createOtpCooldown, formatCooldown } from '../../mobile-app/src/lib/stores/otpCooldown.ts';

const originalNow = Date.now;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  Date.now = originalNow;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function get(cooldown: ReturnType<typeof createOtpCooldown>) {
  let seconds = 0;
  const unsubscribe = cooldown.subscribe((value) => { seconds = value; });
  unsubscribe();
  return seconds;
}

describe('OTP retry feedback', () => {
  test('reads the API JSON wait duration when CORS hides Retry-After', () => {
    const error = new ApiError(429, JSON.stringify({ code: 'RATE_LIMITED', retryAfter: 899 }));
    expect(error.retryAfterSeconds).toBe(899);
    expect(error.code).toBe('RATE_LIMITED');
    expect(formatCooldown(error.retryAfterSeconds!)).toBe('14:59');
  });

  test('uses Retry-After seconds or HTTP date even with a non-JSON response', () => {
    Date.now = () => Date.UTC(2026, 9, 3, 12);
    expect(new ApiError(429, 'unavailable', '120').retryAfterSeconds).toBe(120);
    expect(new ApiError(429, '{}', 'Sat, 03 Oct 2026 12:02:00 GMT').retryAfterSeconds).toBe(120);
    expect(new ApiError(429, '{}', 'Sat, 03 Oct 2026 11:59:00 GMT').retryAfterSeconds).toBe(0);
  });

  test('ignores invalid wait values without crashing error handling', () => {
    for (const retryAfter of [null, -5, 'invalid']) {
      expect(new ApiError(429, JSON.stringify({ retryAfter })).retryAfterSeconds).toBeUndefined();
    }
    expect(new ApiError(429, 'not JSON').retryAfterSeconds).toBeUndefined();
  });

  test('counts from the deadline after returning from a background tab', () => {
    let now = 1_000_000;
    Date.now = () => now;
    const cooldown = createOtpCooldown('test-cooldown');
    cooldown.start(900);
    expect(get(cooldown)).toBe(900);
    now += 123_400;
    expect(get(cooldown)).toBe(777);
    cooldown.start(60);
    expect(get(cooldown)).toBe(777);
    now += 777_000;
    expect(get(cooldown)).toBe(0);
  });

  test('invalid durations do not disable the action indefinitely', () => {
    const cooldown = createOtpCooldown('test-invalid-cooldown');
    cooldown.start(Infinity);
    cooldown.start(-1);
    expect(get(cooldown)).toBe(0);
    expect(formatCooldown(0)).toBe('0:00');
    expect(formatCooldown(60)).toBe('1:00');
  });

  test('refresh restores the remaining wait without restarting it', () => {
    let now = 1_000_000;
    Date.now = () => now;
    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    } });
    createOtpCooldown('persisted-test').start(300);
    now += 45_000;
    expect(get(createOtpCooldown('persisted-test'))).toBe(255);
    now += 255_000;
    expect(get(createOtpCooldown('persisted-test'))).toBe(0);
  });

  test('storage restrictions do not prevent the in-memory countdown', () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      get sessionStorage() { throw new Error('Storage blocked'); },
    } });
    Date.now = () => 1_000_000;
    const cooldown = createOtpCooldown('blocked-storage');
    cooldown.start(120);
    expect(get(cooldown)).toBe(120);
  });
});
