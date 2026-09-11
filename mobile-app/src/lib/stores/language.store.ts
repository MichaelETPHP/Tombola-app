import { locale } from 'svelte-i18n';
import { initI18n } from '$lib/i18n/index.js';

export type AppLanguage = 'en' | 'am';
const STORAGE_KEY = 'yeneeta:language';
const LEGACY_STORAGE_KEY = 'tombola:language';
const LEGACY_LOCALE_KEY = 'yeneeta:locale';
const LEGACY_LOCALE_KEY_OLD = 'tombola:locale';

export interface LanguageOption {
  code: AppLanguage;
  label: string;
}

export const languages: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
];

// svelte-i18n's own `locale` store IS the single source of truth — no
// separate writable to drift out of sync with it (see the two-stores bug
// this replaced: locale.store.ts previously changed only a header badge,
// never the rendered text, because nothing read from it).
export const language = locale;

function detectInitial(): AppLanguage {
  const saved =
    localStorage.getItem(STORAGE_KEY) ??
    localStorage.getItem(LEGACY_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_LOCALE_KEY) ??
    localStorage.getItem(LEGACY_LOCALE_KEY_OLD);
  return saved === 'am' || (!saved && navigator.language.toLowerCase().startsWith('am')) ? 'am' : 'en';
}

/**
 * Loads the detected/persisted locale's dictionary and resolves once ready.
 * Called once from the root layout's onMount — this is a static-adapter
 * SPA, so top-level localStorage/navigator access would run during
 * prerendering, where they don't exist.
 */
export function initLanguage(): Promise<void> {
  const detected = detectInitial();
  document.documentElement.lang = detected;
  return initI18n(detected);
}

export function setLanguage(value: AppLanguage): void {
  locale.set(value);
  localStorage.setItem(STORAGE_KEY, value);
  document.documentElement.lang = value;
}
