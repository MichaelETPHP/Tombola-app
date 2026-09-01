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
