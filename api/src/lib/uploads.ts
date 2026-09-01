import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import type { ProcessedImage } from './image.js';

export interface StoredUpload {
  /** category/filename — pass back to deleteUploadedImage to remove it */
  path: string;
  publicUrl: string;
}

// Relative to the process cwd — that's the Docker image's WORKDIR (/app)
// in production and the repo root locally, so this needs no separate env
// var to configure. In Docker this path is backed by a named volume (see
// docker-compose.yml) specifically so uploads survive a redeploy — the
// container filesystem itself is rebuilt from scratch on every deploy,
// same as everything else in this project's images.
const UPLOADS_DIR = 'uploads';

/**
 * Save a processed image to disk under a category subfolder and return a
 * URL to hand back to the caller. Filename is random, not content-derived
 * — nothing here needs de-duplication, and a random name avoids leaking
 * any information (raffle id, upload order) through it.
 *
 * publicUrl is deliberately ORIGIN-RELATIVE ("/uploads/...", not
 * "https://host/uploads/..."). This value gets stored permanently in the
 * database, and this API's database is shared across every environment
 * that talks to it (local dev machines included, per project convention)
 * — an absolute URL baked in at upload time freezes in whichever
 * environment happened to process that one request, corrupting the image
 * for every OTHER environment reading the same row forever after. Each
 * frontend (mobile-app, admin-app) resolves the relative path against its
 * own correctly-configured API origin at render time instead — see
 * resolveImageUrl() in each app's utils. Absolute URLs already stored
 * from before this change keep rendering exactly as before (resolveImageUrl
 * passes them through untouched), so this is non-breaking.
 */
export async function saveUploadedImage(image: ProcessedImage, category: string): Promise<StoredUpload> {
  const dir = join(UPLOADS_DIR, category);
  await mkdir(dir, { recursive: true });

  const filename = `${nanoid(21)}.${image.format}`;
  await Bun.write(join(dir, filename), image.buffer);

  return {
    path: `${category}/${filename}`,
    publicUrl: `/uploads/${category}/${filename}`,
  };
}

/** Remove a previously saved upload. Missing files are not an error. */
export async function deleteUploadedImage(path: string): Promise<void> {
  await unlink(join(UPLOADS_DIR, path)).catch((err) => {
    if (err?.code !== 'ENOENT') throw err;
  });
}

/**
 * Map a stored image URL back to the `category/filename` path
 * deleteUploadedImage expects — used when an update replaces a raffle's
 * image and the old one needs cleaning up. Handles both the current
 * relative form ("/uploads/category/file") and the legacy absolute form
 * ("https://host/uploads/category/file") from before publicUrl stopped
 * baking in a specific origin, so old records still clean up correctly.
 */
export function uploadedImagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = '/uploads/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

/**
 * Resolve a category/filename pair (as received by the serving route)
 * back to a real file on disk, guarding against path traversal — the
 * two segments are taken from the URL path, so `..`/slashes must be
 * rejected before ever touching the filesystem.
 */
export function resolveUploadPath(category: string, filename: string): string | null {
  if (!/^[a-z0-9_-]+$/i.test(category) || !/^[a-z0-9_-]+\.[a-z0-9]+$/i.test(filename)) {
    return null;
  }
  return join(UPLOADS_DIR, category, filename);
}
