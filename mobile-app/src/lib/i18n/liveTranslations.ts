import { addMessages } from 'svelte-i18n';
import { api } from '$lib/api/client.js';
import type { AppLanguage } from '$lib/stores/language.store.js';

// svelte-i18n's own LocaleDictionary type isn't exported from the package
// (only used internally), so this mirrors its shape locally rather than
// reaching into dist/runtime.d.ts.
type LocaleDictionary = { [key: string]: LocaleDictionary | string | null };

/**
 * "numbers.continue" -> {numbers: {continue: value}} — the nested shape
 * addMessages() expects, matching en.json/am.json's own structure (see
 * api/src/db/seed-i18n.ts, which flattens the same files the other way).
 */
function unflatten(flat: Record<string, string>): LocaleDictionary {
  const root: LocaleDictionary = {};
  for (const [path, value] of Object.entries(flat)) {
    const segments = path.split('.');
    let node = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (typeof node[segment] !== 'object' || node[segment] === null) node[segment] = {};
      node = node[segment] as LocaleDictionary;
    }
    node[segments[segments.length - 1]] = value;
  }
  return root;
}

/**
 * Best-effort live overrides for admin-edited text (see the Translations
 * page in admin-app), merged over the bundled en.json/am.json dictionary
 * that register() in ./index.ts already loaded. Deliberately never
 * awaited by the boot sequence (see language.store.ts) — a slow or failed
 * request just means this locale keeps showing its bundled text exactly
 * as built, which is always correct, just possibly not an admin's very
 * latest edit yet.
 */
export async function loadLiveTranslations(targetLocale: AppLanguage): Promise<void> {
  try {
    const map = await api.get<Record<string, string>>(`/translations/${targetLocale}`, {
      skipAuth: true,
      cache: 'no-store',
    });
    if (Object.keys(map).length) addMessages(targetLocale, unflatten(map));
  } catch {
    // Offline, API unreachable, whatever — the bundled dictionary already
    // loaded is a completely correct fallback, not a degraded state.
  }
}
