import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import type { ProcessedImage } from './image.js';

export interface StoredObject {
  path: string;
  publicUrl: string;
}

function storageConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase Storage is not configured');
  }
  return {
    baseUrl: env.SUPABASE_URL.replace(/\/$/, ''),
    key: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.SUPABASE_STORAGE_BUCKET,
  };
}

function encodedObjectPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function storageHeaders(key: string): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function uploadRaffleImage(image: ProcessedImage): Promise<StoredObject> {
  const { baseUrl, key, bucket } = storageConfig();
  const path = `raffles/${nanoid(28)}.webp`;
  const response = await fetch(
    `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(path)}`,
    {
      method: 'POST',
      headers: {
        ...storageHeaders(key),
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Blob([Uint8Array.from(image.buffer)], { type: 'image/webp' }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail}`);
  }
  return {
    path,
    publicUrl: `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedObjectPath(path)}`,
  };
}

export async function deleteRaffleImage(path: string): Promise<void> {
  const { baseUrl, key, bucket } = storageConfig();
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers: { ...storageHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase Storage delete failed (${response.status})`);
  }
}

export function raffleImagePathFromPublicUrl(url: string | null): string | null {
  if (!url || !env.SUPABASE_URL) return null;
  const prefix = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/`;
  if (!url.startsWith(prefix)) return null;
  try {
    return url.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}
