import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Lives under the same named volume as uploads (see docker-compose.yml) —
 * the only path in the container that survives a redeploy. Anything
 * written elsewhere is gone the moment the next `git push` rebuilds the
 * image.
 */
const BACKUPS_DIR = join('uploads', 'backups');

/** How many nightly backups to keep before the oldest are deleted. */
const RETENTION_COUNT = 7;

const FILENAME_PATTERN = /^tombola-backup-(\d{4}-\d{2}-\d{2})\.sql$/;

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function filenameForDate(date: Date): string {
  return `tombola-backup-${date.toISOString().slice(0, 10)}.sql`;
}

/**
 * Lists backups newest-first. Filenames double as the sort key (the date
 * they encode sorts identically as a string or as a real date) and as the
 * source of truth for "did today's backup already run" — no separate
 * state file to fall out of sync with what's actually on disk.
 */
export async function listBackups(): Promise<BackupFileInfo[]> {
  await mkdir(BACKUPS_DIR, { recursive: true });
  const entries = await readdir(BACKUPS_DIR);
  const infos = await Promise.all(
    entries
      .filter((name) => FILENAME_PATTERN.test(name))
      .map(async (filename) => {
        const stats = await stat(join(BACKUPS_DIR, filename));
        return { filename, sizeBytes: stats.size, createdAt: stats.birthtime.toISOString() };
      })
  );
  return infos.sort((a, b) => b.filename.localeCompare(a.filename));
}

async function enforceRetention(): Promise<void> {
  const backups = await listBackups();
  for (const backup of backups.slice(RETENTION_COUNT)) {
    await unlink(join(BACKUPS_DIR, backup.filename)).catch(() => {});
  }
}

/**
 * Runs pg_dump scoped to just this app's schema. This Postgres instance is
 * shared with an unrelated `salon_core` schema (see project memory) — the
 * quoted `"${env.DB_SCHEMA}"` pattern forces an exact, case-sensitive match
 * on "Tombola_DB" rather than pg_dump's default case-folded comparison,
 * which would otherwise silently match nothing and dump an empty file.
 * --no-owner/--no-privileges drop Supabase-specific role references that
 * wouldn't exist on a plain restore target.
 */
export async function runDatabaseBackup(): Promise<BackupFileInfo> {
  await mkdir(BACKUPS_DIR, { recursive: true });
  const filename = filenameForDate(new Date());
  const path = join(BACKUPS_DIR, filename);

  const proc = Bun.spawn(
    [
      'pg_dump',
      env.DATABASE_URL,
      '--schema', `"${env.DB_SCHEMA}"`,
      '--no-owner',
      '--no-privileges',
      '-f', path,
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    await unlink(path).catch(() => {});
    throw new Error(`pg_dump exited with code ${exitCode}: ${stderr.slice(0, 2000)}`);
  }

  await enforceRetention();

  const stats = await stat(path);
  const info: BackupFileInfo = { filename, sizeBytes: stats.size, createdAt: stats.birthtime.toISOString() };
  logger.info(`Database backup created: ${filename} (${stats.size} bytes)`);
  return info;
}

/** Resolves a requested filename to a real path, rejecting anything that
 *  isn't an exact backup filename this system generated itself — the
 *  filename comes from a URL param, so it must never reach the filesystem
 *  unvalidated. */
export function resolveBackupPath(filename: string): string | null {
  if (!FILENAME_PATTERN.test(filename)) return null;
  return join(BACKUPS_DIR, filename);
}
