/**
 * One-off seed for i18n_strings (migration 035) — flattens the mobile
 * app's bundled en.json/am.json into dot-path rows so the Translations
 * admin page has real starting content instead of an empty table.
 *
 * ON CONFLICT DO NOTHING: safe to re-run any time (e.g. after a developer
 * adds a brand-new key to the JSON files) without ever clobbering a value
 * an admin has already edited through the app.
 *
 * Run manually: `bun run src/db/seed-i18n.ts` from api/.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql, closeDb } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// api/src/db -> api/.. -> mobile-app/src/lib/i18n/locales — sibling app in
// the same monorepo checkout; only ever read here, at seed time, never at
// API runtime (a deployed API container won't have this path available).
const LOCALES_DIR = join(__dirname, '..', '..', '..', 'mobile-app', 'src', 'lib', 'i18n', 'locales');

type Json = string | number | boolean | null | { [key: string]: Json };

function flatten(node: Json, prefix: string, out: Record<string, string>): void {
  if (node === null || typeof node !== 'object') {
    out[prefix] = String(node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

async function seedLocale(locale: 'en' | 'am'): Promise<number> {
  const raw = readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8');
  const flat: Record<string, string> = {};
  flatten(JSON.parse(raw), '', flat);

  const rows = Object.entries(flat).map(([key, value]) => ({ locale, key, value }));
  if (!rows.length) return 0;

  await sql`
    INSERT INTO i18n_strings ${sql(rows, 'locale', 'key', 'value')}
    ON CONFLICT (locale, key) DO NOTHING
  `;
  return rows.length;
}

const enCount = await seedLocale('en');
const amCount = await seedLocale('am');
console.log(`Seeded (or already present): ${enCount} en keys, ${amCount} am keys.`);
await closeDb();
