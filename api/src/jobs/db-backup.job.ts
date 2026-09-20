import { listBackups, runDatabaseBackup } from '../lib/db-backup.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 5 * 60_000;
// Ethiopia is UTC+3 year-round — no daylight saving to account for, so a
// fixed offset is all a "midnight Ethiopian time" check needs.
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function eatNow(): Date {
  return new Date(Date.now() + EAT_OFFSET_MS);
}

function backupFilenameFor(date: Date): string {
  return `tombola-backup-${date.toISOString().slice(0, 10)}.sql`;
}

/**
 * Fires once per Ethiopian calendar day, in the first check after midnight
 * EAT. Whether today's backup already exists is read straight off disk
 * (see listBackups) rather than an in-memory flag, so a process restart
 * mid-window can't cause a duplicate or a skipped day. If the process
 * happens to be down for the entire 00:00–00:59 EAT window, that day's
 * backup is simply skipped — same trade-off every simple cron-style job
 * in this codebase makes (see the other jobs in this folder).
 */
async function checkAndRunNightlyBackup(): Promise<void> {
  try {
    const now = eatNow();
    if (now.getUTCHours() !== 0) return;

    const todaysFilename = backupFilenameFor(now);
    const existing = await listBackups();
    if (existing.some((backup) => backup.filename === todaysFilename)) return;

    logger.info('Running nightly database backup (00:00 Ethiopia time)');
    await runDatabaseBackup();
  } catch (error) {
    logger.error('Nightly database backup failed', error);
  }
}

export function startNightlyDbBackup(): void {
  logger.info('Starting nightly database backup job (00:00 Ethiopia time)');
  setInterval(checkAndRunNightlyBackup, CHECK_INTERVAL_MS);
}
