import { getContext, setContext } from 'svelte';
import { writable, type Writable } from 'svelte/store';

const KEY = Symbol('pull-refresh');

export type RefreshHandler = (() => Promise<void> | void) | null;

/**
 * Called once by the (app) layout — creates the store the PullToRefresh
 * wrapper reads from, and puts it in context so any page underneath can
 * register (or clear) its own refresh function without prop-drilling.
 */
export function createPullRefreshContext(): Writable<RefreshHandler> {
  const store = writable<RefreshHandler>(null);
  setContext(KEY, store);
  return store;
}

/**
 * Called by individual pages to get the shared store, then `.set()` their
 * own data-loading function on it (or `null` to opt this page out).
 */
export function getPullRefreshContext(): Writable<RefreshHandler> {
  return getContext(KEY);
}
