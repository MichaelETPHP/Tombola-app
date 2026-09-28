import {
  getI18nStringsMap,
  listI18nStrings,
  upsertI18nString,
  type DbI18nString,
} from '../../db/queries/i18n.queries.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

function assertLocale(locale: string): asserts locale is 'en' | 'am' {
  if (locale !== 'en' && locale !== 'am') throw new AppError(404, 'Unknown locale.');
}

export async function getPublicTranslations(locale: string): Promise<Record<string, string>> {
  assertLocale(locale);
  return getI18nStringsMap(locale);
}

export async function getAdminTranslations(locale: string): Promise<DbI18nString[]> {
  assertLocale(locale);
  return listI18nStrings(locale);
}

export async function updateTranslation(
  locale: string,
  key: string,
  value: string,
  adminId: string
): Promise<DbI18nString> {
  assertLocale(locale);
  return upsertI18nString(locale, key, value, adminId);
}
