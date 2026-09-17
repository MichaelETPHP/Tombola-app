import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import {
  requestOtpSchema,
  verifyOtpSchema,
  telegramMiniAppSchema,
  telegramOidcSchema,
  telegramMiniAppCompleteSchema,
} from './auth.schema.js';
import {
  requestOtp,
  verifyOtp,
  refreshAccessToken,
  authenticateTelegramMiniApp,
  authenticateTelegramOidc,
  completeTelegramMiniAppLogin,
  linkTelegramContact,
  logout,
} from './auth.service.js';
import { getRefreshTokenFromCookie } from '../../middleware/auth.middleware.js';
import { rateLimit, clientIp } from '../../middleware/rate-limit.middleware.js';
import type { AppEnv } from '../../types/hono.js';
import { env } from '../../config/env.js';
import { createTelegramNonce } from '../../lib/jwt.js';
import { extractSharedContact } from '../../lib/telegram.js';
import { logger } from '../../lib/logger.js';
import { logClientCrash } from '../../lib/client-crash-log.js';
import type { LoginMeta } from './auth.service.js';

export const authRoutes = new Hono<AppEnv>();

// clientIp()'s 'unknown' fallback (no reverse proxy in front, e.g. local
// dev) isn't a valid Postgres INET literal — same guard executeDraw already
// needed for clicked_ip. userAgent capped defensively; browsers/WebViews
// don't send absurdly long ones, but nothing enforces that.
function loginMeta(c: Parameters<typeof clientIp>[0]): LoginMeta {
  const ip = clientIp(c);
  return {
    ip: ip === 'unknown' ? null : ip,
    userAgent: c.req.header('user-agent')?.slice(0, 500) ?? null,
  };
}

function setRefreshCookie(c: Parameters<typeof setCookie>[0], refreshToken: string) {
  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

/**
 * Keys the OTP-send rate limit by the (normalized) phone number being
 * texted, on top of the existing per-IP limit below. The per-IP limit
 * alone can't stop "SMS bombing" — rotating IPs (trivial: airplane mode,
 * a VPN, a proxy list) resets that bucket to zero while the same victim
 * phone number keeps getting texted. This bucket doesn't move when the
 * IP changes, only when the target number does.
 */
async function otpPhoneKey(c: Parameters<typeof clientIp>[0]): Promise<string> {
  try {
    const body = await c.req.json();
    const { phone } = requestOtpSchema.parse(body);
    return `otp-phone:${phone}`;
  } catch {
    // Malformed body — the handler's own schema validation will reject it
    // either way; fall back to the requester's IP so this path can't be
    // used to dodge rate limiting entirely by sending garbage.
    return `otp-phone-invalid:${clientIp(c)}`;
  }
}

/**
 * POST /auth/otp/request
 * Send an OTP to the provided phone number.
 * Rate limited: 5 requests per 5 minutes per IP, AND 3 requests per 15
 * minutes per phone number (see otpPhoneKey above).
 */
authRoutes.post(
  '/otp/request',
  rateLimit({ max: 5, windowSeconds: 300 }),
  rateLimit({ max: 3, windowSeconds: 900, keyExtractor: otpPhoneKey }),
  async (c) => {
    const body = await c.req.json();
    const { phone } = requestOtpSchema.parse(body);

    const result = await requestOtp(phone, c.get('locale'));
    return c.json(
      {
        message: c.get('t')(result.messageKey),
        expiresIn: result.expiresIn,
        demoOtpEnabled: result.demoOtpEnabled,
      },
      200
    );
  }
);

/**
 * POST /auth/otp/verify
 * Verify OTP and receive JWT tokens.
 * Sets refresh token as httpOnly cookie.
 */
authRoutes.post('/otp/verify', rateLimit({ max: 10, windowSeconds: 300 }), async (c) => {
  const body = await c.req.json();
  const { phone, code, telegramLinkToken } = verifyOtpSchema.parse(body);

  const result = await verifyOtp(phone, code, telegramLinkToken, loginMeta(c));

  // Set refresh token as httpOnly secure cookie
  setRefreshCookie(c, result.refreshToken);

  return c.json(
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    200
  );
});

authRoutes.post('/telegram/mini-app', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  const { initData } = telegramMiniAppSchema.parse(await c.req.json());
  const result = await authenticateTelegramMiniApp(initData, loginMeta(c));
  if (result.status === 'authenticated') setRefreshCookie(c, result.refreshToken);
  const { refreshToken: _refreshToken, ...response } = result.status === 'authenticated'
    ? result
    : { ...result, refreshToken: undefined };
  return c.json(response, 200);
});

authRoutes.post('/telegram/nonce', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  if (!env.TELEGRAM_CLIENT_ID) {
    return c.json({ error: 'Telegram login is not configured', code: 'TELEGRAM_NOT_CONFIGURED' }, 503);
  }
  return c.json({ ...(await createTelegramNonce()), clientId: env.TELEGRAM_CLIENT_ID }, 200);
});

/**
 * POST /auth/telegram/mini-app/complete
 * Polled by the Mini App after it calls WebApp.requestContact() and the
 * native "share your number?" popup has been answered — the actual phone
 * number never reaches this client at all, it arrives asynchronously at
 * /auth/telegram/webhook instead. This just checks whether that webhook
 * has finished linking the account yet.
 */
authRoutes.post('/telegram/mini-app/complete', rateLimit({ max: 40, windowSeconds: 300 }), async (c) => {
  const { telegramLinkToken } = telegramMiniAppCompleteSchema.parse(await c.req.json());
  const result = await completeTelegramMiniAppLogin(telegramLinkToken, loginMeta(c));
  if (result.status !== 'authenticated') return c.json(result, 200);
  setRefreshCookie(c, result.refreshToken);
  const { refreshToken: _refreshToken, ...response } = result;
  return c.json(response, 200);
});

/**
 * POST /auth/telegram/webhook
 * Called directly by Telegram's servers (not the app) whenever the bot
 * receives an update — in practice here, only contact-share messages
 * matter. Must be registered with Telegram's setWebhook first; see
 * deploy docs. Verified via the secret token Telegram echoes back on
 * every request once that's configured on both sides.
 */
authRoutes.post('/telegram/webhook', async (c) => {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('Telegram webhook received but TELEGRAM_WEBHOOK_SECRET is not configured — ignoring');
    logClientCrash({
      message: 'Telegram webhook received but TELEGRAM_WEBHOOK_SECRET is not configured',
      platform: 'api', url: c.req.path, selfHealed: false,
    });
    return c.json({ ok: true }, 200);
  }

  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('Telegram webhook rejected: secret token mismatch');
    // This exact silent failure is what made the "didn't hear back from
    // Telegram" bug so hard to track down before — Telegram just sees a
    // 401 and moves on, and nothing else about it was ever visible from
    // the admin dashboard. Now it is.
    logClientCrash({
      message: 'Telegram webhook rejected: secret token mismatch (check TELEGRAM_WEBHOOK_SECRET matches what was registered via setWebhook)',
      platform: 'api', url: c.req.path, selfHealed: false,
    });
    return c.json({ ok: false }, 401);
  }

  try {
    const update = await c.req.json();
    const contact = extractSharedContact(update);
    if (contact) await linkTelegramContact(contact);
  } catch (error) {
    logger.error(`Telegram webhook processing failed: ${String(error)}`);
    logClientCrash({
      message: `Telegram webhook processing failed: ${error instanceof Error ? error.message : String(error)}`,
      stack: error instanceof Error ? error.stack : undefined,
      platform: 'api', url: c.req.path, selfHealed: false,
    });
  }

  // Always 200 once authenticated — Telegram retries indefinitely on a
  // non-2xx response, and this processing is idempotent either way, so
  // swallowing a processing error here is safer than risking a retry storm.
  return c.json({ ok: true }, 200);
});

authRoutes.post('/telegram/oidc', rateLimit({ max: 20, windowSeconds: 300 }), async (c) => {
  const { idToken, nonceToken } = telegramOidcSchema.parse(await c.req.json());
  const result = await authenticateTelegramOidc(idToken, nonceToken, loginMeta(c));
  if ('refreshToken' in result) {
    setRefreshCookie(c, result.refreshToken);
    const { refreshToken: _refreshToken, ...response } = result;
    return c.json(response, 200);
  }
  return c.json(result, 200);
});

/**
 * POST /auth/refresh
 * Exchange a valid refresh token (from cookie) for a new access token.
 */
authRoutes.post('/refresh', rateLimit({ max: 30, windowSeconds: 300 }), async (c) => {
  const refreshToken = getRefreshTokenFromCookie(c);

  if (!refreshToken) {
    return c.json({ error: c.get('t')('auth.invalidToken'), code: 'AUTH_REFRESH_REQUIRED' }, 401);
  }

  const result = await refreshAccessToken(refreshToken);
  return c.json(result, 200);
});

/**
 * POST /auth/logout
 * Clears the refresh token cookie (so this browser can't silently mint a
 * new access token on its next visit) and bumps the account's
 * session_version, which invalidates this refresh token server-side too —
 * closing the gap where a copy of it, extracted some other way before this
 * call, would otherwise have stayed valid for up to 30 more days.
 */
authRoutes.post('/logout', async (c) => {
  await logout(getRefreshTokenFromCookie(c));
  deleteCookie(c, 'refresh_token', { path: '/' });
  return c.json({ message: c.get('t')('auth.loggedOut') }, 200);
});
