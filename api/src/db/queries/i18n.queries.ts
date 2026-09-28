import { sql } from '../client.js';

export interface DbI18nString {
  locale: 'en' | 'am';
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}

export async function listI18nStrings(locale: 'en' | 'am'): Promise<DbI18nString[]> {
  return sql<DbI18nString[]>`SELECT * FROM i18n_strings WHERE locale = ${locale} ORDER BY key`;
}

/** Flat {key: value} map — exactly what the mobile app's addMessages() merge step wants. */
export async function getI18nStringsMap(locale: 'en' | 'am'): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM i18n_strings WHERE locale = ${locale}
  `;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function upsertI18nString(
  locale: 'en' | 'am',
  key: string,
  value: string,
  adminId: string
): Promise<DbI18nString> {
  const [row] = await sql<DbI18nString[]>`
    INSERT INTO i18n_strings (locale, key, value, updated_by)
    VALUES (${locale}, ${key}, ${value}, ${adminId})
    ON CONFLICT (locale, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
    RETURNING *
  `;
  return row;
}
