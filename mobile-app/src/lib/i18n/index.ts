import { register, init, locale, waitLocale } from 'svelte-i18n';

register('en', () => import('./locales/en.json'));
register('am', () => import('./locales/am.json'));

// Called eagerly at module scope (not from onMount) so the locale is always
// set before any component renders — this module is imported during SSR
// too (every dev-server request, and the adapter-static prerender pass),
// and `$_`/`$format` throw if `locale` was never set. Defaulting to 'en'
// here is fine: it only affects the transient server-rendered markup: the
// client immediately corrects it to the detected/persisted locale in
// initLanguage() below, before the boot splash hides.
init({ fallbackLocale: 'en', initialLocale: 'en' });

/** Switches to the detected/persisted locale and resolves once its dictionary is loaded. */
export function initI18n(targetLocale: 'en' | 'am'): Promise<void> {
  locale.set(targetLocale);
  return waitLocale();
}

export { waitLocale };
