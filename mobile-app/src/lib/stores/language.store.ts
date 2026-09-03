import { writable } from 'svelte/store';

export type AppLanguage = 'en' | 'am';
const STORAGE_KEY = 'yeneeta:language';
const LEGACY_STORAGE_KEY = 'tombola:language';

export const language = writable<AppLanguage>('en');

export function initLanguage(): void {
  const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  const detected: AppLanguage = saved === 'am' || (!saved && navigator.language.toLowerCase().startsWith('am')) ? 'am' : 'en';
  language.set(detected);
  document.documentElement.lang = detected;
}

export function setLanguage(value: AppLanguage): void {
  language.set(value);
  localStorage.setItem(STORAGE_KEY, value);
  document.documentElement.lang = value;
}
