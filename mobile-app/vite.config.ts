import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const pwaManifest = {
  name: 'YeneEta',
  short_name: 'YeneEta',
  description: "YeneEta — Ethiopia's premier raffle platform — win amazing prizes with transparent, provably-fair draws.",
  theme_color: '#00D3A0',
  background_color: '#E3F9EF',
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  start_url: '/',
  scope: '/',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// app.html has an unconditional <link rel="manifest">, but the PWA plugin
// only serves /manifest.webmanifest in dev when devOptions.enabled is on —
// which we keep off by default (see below) to avoid noisy dev-mode SW
// warnings. Serve the same manifest ourselves so the link never 404s.
function serveManifestInDev(): Plugin {
  return {
    name: 'serve-pwa-manifest-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(pwaManifest));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    serveManifestInDev(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: pwaManifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,woff2,ico,webmanifest}'],
        // API calls should never be served from the cache — always hit the network.
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        // Off by default: with kit.spa enabled, vite-plugin-pwa's dev-mode
        // service worker build runs workbox's glob-precache scan against a
        // stub dev-dist folder, which prints noisy "glob pattern doesn't
        // match any files" warnings on every `bun run dev` even though
        // nothing is actually broken. Opt in with
        // `VITE_PWA_DEV=true bun run dev` when you need to test installability.
        enabled: process.env.VITE_PWA_DEV === 'true',
        type: 'module',
      },
      kit: {
        // adapter-static is configured with a SPA fallback (see svelte.config.js)
        // — tell the plugin so the fallback page's revision is precached too.
        spa: true,
      },
    }),
  ],
  server: {
    port: 4345,
    host: '0.0.0.0',
  },
});
