import { writable } from 'svelte/store';

/** Drives the "Press back again to exit" toast — see lib/native/backButton.ts. */
export const showExitHint = writable(false);
