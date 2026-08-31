import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import type { ProcessedImage } from './image.js';

// Relative to the process cwd — that's the Docker image's WORKDIR (/app)
// in production and the repo root locally, so this needs no separate env
// var to configure. In Docker this path is backed by a named volume (see
// docker-compose.yml) specifically so uploads survive a redeploy — the
// container filesystem itself is rebuilt from scratch on every deploy,
// same as everything else in this project's images.
const UPLOADS_DIR = 'uploads';

/**
 * Save a processed image to disk under a category subfolder and return
 * the absolute URL to hand back to the caller. Filename is random, not
 * content-derived — nothing here needs de-duplication, and a random name
 * avoids leaking any information (raffle id, upload order) through it.
 */
export async function saveUploadedImage(image: ProcessedImage, category: string): Promise<string> {
  const dir = join(UPLOADS_DIR, category);
  await mkdir(dir, { recursive: true });

  const filename = `${nanoid(21)}.${image.format}`;
  await Bun.write(join(dir, filename), image.buffer);

  return `${env.API_BASE_URL}/uploads/${category}/${filename}`;
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
