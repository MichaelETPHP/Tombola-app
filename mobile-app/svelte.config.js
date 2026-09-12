import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // adapter-static for Capacitor wrapping
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html', // SPA fallback for client-side routing
      precompress: false,
      strict: true,
    }),
    // Backs the $updated store ($app/stores) — SvelteKit's own build-
    // freshness check, independent of the service-worker/cache-header
    // layer entirely: it fetches _app/version.json (always no-cache, see
    // nginx config) and compares against the version this page loaded
    // with. The interval covers a tab left open a long time; the Telegram
    // resume handler in +layout.svelte calls updated.check() directly for
    // an immediate check on foreground, which is the case that actually
    // mattered (a suspended Mini App can sit on a stale build far longer
    // than any reasonable poll interval would catch in time).
    version: {
      pollInterval: 5 * 60 * 1000,
    },
  },
};

export default config;
