import i18next, { type TFunction } from 'i18next';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types/hono.js';

export const supportedLocales = ['en', 'am'] as const;
export type Locale = (typeof supportedLocales)[number];

await i18next.init({
  fallbackLng: 'en',
  supportedLngs: [...supportedLocales],
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: {
      'common.validationFailed': 'Validation failed',
      'common.internalError': 'Internal server error',
      'common.notFound': 'Resource not found',
      'auth.otpSent': 'Verification code sent',
      'auth.otpMissing': 'No verification code found. Please request a new one.',
      'auth.otpExpired': 'Verification code expired. Please request a new one.',
      'auth.otpInvalid': 'Invalid verification code.',
      'auth.tooManyAttempts': 'Too many attempts. Please request a new verification code.',
      'auth.accountSuspended': 'Your account is not active. Contact support.',
      'auth.invalidCredentials': 'Invalid credentials',
      'auth.invalidToken': 'Invalid or expired token',
      'auth.missingToken': 'Missing or invalid Authorization header',
      'auth.sessionRevoked': 'You were logged out because this account signed in on another device.',
      'auth.loggedOut': 'Logged out',
      'auth.otpSendFailed': 'Failed to send verification code. Please try again.',
      'auth.telegramNotConfigured': 'Telegram login is not configured',
      'auth.telegramInvalid': 'Telegram login could not be verified',
      'auth.telegramExpired': 'Telegram login expired. Please reopen the app.',
      'auth.telegramAlreadyLinked': 'This Telegram account is already linked',
      'user.notFound': 'User not found',
      'raffle.notFound': 'Raffle not found',
      'raffle.updated': 'Raffle updated',
      'raffle.invalidTransition': 'This raffle status change is not allowed',
      'raffle.salesLocked': 'Ticket settings cannot be changed after sales begin',
      'rate.tooMany': 'Too many requests',
    } },
    am: { translation: {
      'common.validationFailed': 'የገባው መረጃ ትክክል አይደለም',
      'common.internalError': 'የሰርቨር ችግኝ ተፈጥሯል',
      'common.notFound': 'የተጠየቀው መረጃ አልተገኘም',
      'auth.otpSent': 'የማረጋገጫ ኮድ ተልኳል',
      'auth.otpMissing': 'የማረጋገጫ ኮድ አልተገኘም። አዲስ ኮድ ይጠይቁ።',
      'auth.otpExpired': 'የማረጋገጫ ኮዱ ጊዜው አልፏል። አዲስ ኮድ ይጠይቁ።',
      'auth.otpInvalid': 'የማረጋገጫ ኮዱ ትክክል አይደለም።',
      'auth.tooManyAttempts': 'ብዙ ጊዜ ሞክረዋል። አዲስ ኮድ ይጠይቁ።',
      'auth.accountSuspended': 'መለያዎ ንቁ አይደለም። ድጋፍን ያነጋግሩ።',
      'auth.invalidCredentials': 'የመግቢያ መረጃው ትክክል አይደለም',
      'auth.invalidToken': 'የመግቢያ ፍቃዱ ትክክል አይደለም ወይም ጊዜው አልፏል',
      'auth.missingToken': 'የመግቢያ ፍቃድ አልተገኘም',
      'auth.sessionRevoked': 'ይህ መለያ በሌላ መሳሪያ ላይ ስለገባ ከዚህ መሳሪያ ወጥተዋል።',
      'auth.loggedOut': 'ከመለያዎ ወጥተዋል',
      'auth.otpSendFailed': 'የማረጋገጫ ኮድ መላክ አልተቻለም። እንደገና ይሞክሩ።',
      'user.notFound': 'ተጠቃሚው አልተገኘም',
      'raffle.notFound': 'ዕጣው አልተገኘም',
      'raffle.updated': 'ዕጣው ተሻሽሏል',
      'raffle.invalidTransition': 'ይህ የዕጣ ሁኔታ ለውጥ አይፈቀድም',
      'raffle.salesLocked': 'ሽያጭ ከጀመረ በኋላ የትኬት ቅንብር መቀየር አይቻልም',
      'rate.tooMany': 'ብዙ ጥያቄዎች ተልከዋል',
    } },
  },
});

export function resolveLocale(value?: string): Locale {
  const preferred = value?.toLowerCase().split(',')[0]?.split('-')[0];
  return preferred === 'am' ? 'am' : 'en';
}

export const languageMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const locale = resolveLocale(c.req.query('lang') ?? c.req.header('accept-language'));
  c.set('locale', locale);
  c.set('t', i18next.getFixedT(locale));
  c.header('Content-Language', locale);
  await next();
};

export function translate(t: TFunction | undefined, key: string): string {
  return t ? t(key) : i18next.t(key, { lng: 'en' });
}
