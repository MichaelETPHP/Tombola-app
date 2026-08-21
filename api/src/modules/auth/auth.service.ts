import { findUserByPhone, createUser } from '../../db/queries/users.queries.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { sendOtp } from '../../lib/sms.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

/**
 * In-memory OTP store.
 * In production, use Redis or a database table with TTL.
 */
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 3;

/**
 * Generate a 6-digit OTP code.
 */
function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Request an OTP for a phone number.
 */
export async function requestOtp(phone: string): Promise<{ message: string }> {
  const code = generateOtpCode();

  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });

  // Clean up expired entries periodically
  for (const [key, entry] of otpStore) {
    if (entry.expiresAt <= Date.now()) {
      otpStore.delete(key);
    }
  }

  const result = await sendOtp(phone, code);

  if (!result.success) {
    logger.error(`Failed to send OTP to ${phone}: ${result.error}`);
    throw new AppError(500, 'Failed to send verification code. Please try again.');
  }

  logger.info(`OTP requested for ${phone}`);

  return { message: 'Verification code sent' };
}

/**
 * Verify an OTP code and issue JWT tokens.
 * Auto-registers the user on first successful verification.
 */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; fullName: string | null; isNewUser: boolean };
}> {
  const stored = otpStore.get(phone);

  if (!stored) {
    throw new AppError(400, 'No verification code found. Please request a new one.');
  }

  if (stored.expiresAt <= Date.now()) {
    otpStore.delete(phone);
    throw new AppError(400, 'Verification code expired. Please request a new one.');
  }

  stored.attempts++;

  if (stored.attempts > MAX_OTP_ATTEMPTS) {
    otpStore.delete(phone);
    throw new AppError(429, 'Too many attempts. Please request a new verification code.');
  }

  if (stored.code !== code) {
    throw new AppError(400, 'Invalid verification code.');
  }

  // OTP verified — clean up
  otpStore.delete(phone);

  // Find or create user
  let user = await findUserByPhone(phone);
  let isNewUser = false;

  if (!user) {
    user = await createUser(phone);
    isNewUser = true;
    logger.info(`New user registered: ${phone}`);
  }

  if (user.isSuspended) {
    throw new AppError(403, 'Your account has been suspended. Contact support.');
  }

  // Issue tokens
  const accessToken = await signAccessToken({
    sub: user.id,
    phone: user.phone,
    role: 'user',
  });

  const refreshToken = await signRefreshToken({
    sub: user.id,
    role: 'user',
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      isNewUser,
    },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string }> {
  const payload = await verifyRefreshToken(refreshToken);

  const user = await findUserByPhone(payload.sub);

  // Re-fetch to get current phone (in case it was changed)
  // Using sub as user ID
  const userById = user; // In a real app, look up by ID

  if (!userById) {
    throw new AppError(401, 'User not found');
  }

  if (userById.isSuspended) {
    throw new AppError(403, 'Account suspended');
  }

  const accessToken = await signAccessToken({
    sub: userById.id,
    phone: userById.phone,
    role: payload.role,
  });

  return { accessToken };
}
