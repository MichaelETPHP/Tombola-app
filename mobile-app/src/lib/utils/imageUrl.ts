import { API_BASE } from '../api/client.js';

/**
 * Uploaded images are stored as an origin-relative path ("/uploads/raffles/x.webp")
 * rather than a full URL — the API's database is shared across every
 * environment that talks to it, so baking in a specific origin at upload
 * time would freeze the wrong host for every OTHER environment reading
 * that row. Resolve the relative path against this app's own API origin
 * at render time instead. External/absolute URLs (stock photos, or
 * records saved before this change) pass through unchanged.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/uploads/') ? `${API_BASE}${url}` : url;
}

// Uploaded files live on whichever server's disk/volume actually processed
// the upload (see api/src/lib/uploads.ts) — each environment has its own,
// they are NOT shared storage. So a relative path resolved against a local
// dev API almost always 404s for any image that was actually uploaded via
// production. PrizeImage.svelte uses this as a second attempt after the
// local origin fails, so images still show up while developing locally
// against the shared database.
const PRODUCTION_API_URL = 'https://jvbgvlbqbxt4rgf3r720wawd.187.77.12.130.sslip.io';

export function productionImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/uploads/') ? `${PRODUCTION_API_URL}${url}` : url;
}
