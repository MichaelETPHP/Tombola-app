import Kenat from 'kenat';
import { get } from 'svelte/store';
import { language } from '$lib/stores/language.store.js';

/**
 * Ethiopian-calendar date formatting for user-facing dates (payment history,
 * receipts). Unlike admin-app's hardcoded-Amharic equivalent (an internal
 * tool for Amharic-speaking staff), this respects the app's own bilingual
 * $language store so an English-mode user doesn't suddenly see Amharic.
 */
function currentLang(): 'english' | 'amharic' {
  return get(language) === 'am' ? 'amharic' : 'english';
}

export function toEthiopianDate(iso: string | Date): string {
  return new Kenat(new Date(iso)).format({ lang: currentLang() });
}

export function toEthiopianDateTime(iso: string | Date): string {
  return new Kenat(new Date(iso)).format({ lang: currentLang(), includeTime: true });
}
