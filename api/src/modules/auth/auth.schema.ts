import { z } from 'zod';

/**
 * Phone number validation — Ethiopian format.
 * Accepts: +251XXXXXXXXX, 0XXXXXXXXX, or 9XXXXXXXX
 */
const ethiopianPhone = z
  .string()
  .trim()
  .transform((val) => {
    // Normalize to +251 format
    if (val.startsWith('+251')) return val;
    if (val.startsWith('0')) return `+251${val.slice(1)}`;
    if (val.startsWith('9')) return `+251${val}`;
    return val;
  })
  .pipe(
    z.string().regex(/^\+251[0-9]{9}$/, 'Invalid Ethiopian phone number')
  );

export const requestOtpSchema = z.object({
  phone: ethiopianPhone,
});

export const verifyOtpSchema = z.object({
  phone: ethiopianPhone,
  code: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]{6}$/, 'OTP must contain only digits'),
  telegramLinkToken: z.string().min(20).optional(),
});

export const telegramMiniAppSchema = z.object({
  initData: z.string().min(20).max(16_000),
});

export const telegramOidcSchema = z.object({
  idToken: z.string().min(100),
  nonceToken: z.string().min(20),
});

export const telegramMiniAppCompleteSchema = z.object({
  telegramLinkToken: z.string().min(20),
});

export const refreshTokenSchema = z.object({
  // The refresh token comes from httpOnly cookie, not request body.
  // This schema is for any additional body params if needed.
});

// Inferred types
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
