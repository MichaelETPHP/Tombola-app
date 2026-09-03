import { writable } from 'svelte/store';

const KEY = 'yeneeta:locale';
const LEGACY_KEY = 'tombola:locale';

export interface Locale {
  code: 'en' | 'am';
  label: string;
}

export const locales: Locale[] = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
];

export const locale = writable<Locale['code']>('en');

/**
 * Restores a previously chosen language. Called from onMount (not at module
 * load) — this is a static-adapter SPA, so top-level localStorage access
 * would run during prerendering, where `localStorage` doesn't exist.
 */
export function initLocale(): void {
  try {
    const stored = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (stored === 'en' || stored === 'am') {
      locale.set(stored);
    }
  } catch {
    // localStorage unavailable (e.g. private mode) — default 'en' stands.
  }
}

export function setLocale(code: Locale['code']): void {
  locale.set(code);
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // ignore — selection still applies for this session
  }
}
