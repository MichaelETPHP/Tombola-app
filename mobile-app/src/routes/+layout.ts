// Side-effect only: guarantees svelte-i18n's register()+init() (see
// $lib/i18n/index.ts) have run before ANY component in this route tree
// ever renders — including this layout's own +layout.svelte, and the root
// +page.svelte's <SplashScreen/>, which calls $_() in a reactive block
// during its very first render, before onMount ever fires.
//
// +layout.svelte previously relied on its own <script> importing
// language.store.ts (which transitively imports this) happening to
// execute before a sibling route's chunk did — an assumption about chunk
// load/evaluation ordering, not something SvelteKit actually guarantees.
// A universal load module (+layout.ts) is different: SvelteKit's routing
// itself always fully resolves a layout's +layout.ts before rendering
// that layout's .svelte file or anything nested inside it. That's a real
// framework contract, not a timing coincidence — which is what an
// intermittent, real-world "[svelte-i18n] Cannot format a message without
// first setting the initial locale" crash traced back to: SplashScreen
// imports `_` straight from the svelte-i18n package, not through this
// module, so nothing previously forced init() to have run first.
//
// Safe at prerender/SSR time too — $lib/i18n/index.ts's top-level code
// only calls svelte-i18n's own register()/init(), no DOM access.
import '$lib/i18n/index.js';
