import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const buildEnv = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
const apiOrigin = new URL(buildEnv.VITE_API_URL || 'http://localhost:3435').origin;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // adapter-node: run the built dashboard with `bun ./build/index.js`
    adapter: adapter(),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        // Svelte transitions and progress widths need inline styles.
        'style-src': ['self', 'unsafe-inline'],
        'font-src': ['self'],
        'img-src': ['self', 'https:', 'data:', 'blob:', apiOrigin],
        'connect-src': ['self', apiOrigin, ...(process.env.NODE_ENV === 'production' ? [] : ['ws:', 'wss:'])],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};

export default config;
