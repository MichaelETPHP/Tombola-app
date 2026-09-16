import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { parseCsv } from '../../lib/csv.js';
import { sendBulkSms, toE164, isValidE164 } from '../../lib/sms.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

export interface Contact {
  phone: string;
  name: string | null;
  importedAt: string;
}

// Same directory tree as raffle image uploads (see lib/uploads.ts) —
// backed by a named Docker volume specifically so this survives a
// redeploy, unlike the rest of the container filesystem, which is rebuilt
// from scratch every time.
const CONTACTS_DIR = join('uploads', 'contacts');
const CONTACTS_FILE = join(CONTACTS_DIR, 'contacts.json');

// This file has exactly one writer path (this module), but that path can
// still run concurrently — two overlapping "import" or "delete" requests
// would otherwise both read the same starting array, each apply their own
// change, and whichever writes last silently erases the other's. Chaining
// every read-modify-write through one promise serializes them within this
// single process, which is all a JSON-file-backed store needs (no other
// process ever writes this file).
let writeChain: Promise<unknown> = Promise.resolve();
function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn, fn);
  writeChain = result.then(() => undefined, () => undefined);
  return result;
}

async function readContacts(): Promise<Contact[]> {
  const file = Bun.file(CONTACTS_FILE);
  if (!(await file.exists())) return [];
  try {
    const data = (await file.json()) as unknown;
    return Array.isArray(data) ? (data as Contact[]) : [];
  } catch {
    // A corrupted file must never crash every future read — treat it as
    // empty rather than taking the whole feature down. The next successful
    // write overwrites it with a well-formed array.
    return [];
  }
}

/** Write-to-temp-then-rename so a crash mid-write can never leave a
 *  half-written, corrupted contacts.json behind — rename is atomic on the
 *  same filesystem, which the temp file always is (same directory). */
async function writeContactsAtomic(contacts: Contact[]): Promise<void> {
  await mkdir(CONTACTS_DIR, { recursive: true });
  const tempPath = join(CONTACTS_DIR, `.contacts.${nanoid(8)}.tmp`);
  await Bun.write(tempPath, JSON.stringify(contacts, null, 2));
  await rename(tempPath, CONTACTS_FILE);
}

export async function listContacts(): Promise<Contact[]> {
  const contacts = await readContacts();
  return [...contacts].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

/** Loosely matches a CSV header cell to what it's meant to hold. */
function isPhoneHeader(header: string): boolean {
  return /phone|mobile|number|tel/i.test(header);
}
function isNameHeader(header: string): boolean {
  return /name/i.test(header);
}

export interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  totalContacts: number;
}

/**
 * Parses a CSV upload into contacts, normalizes every phone number to
 * +251 E.164, and merges into the existing store — never overwriting it.
 * A number already on file (or repeated within the same CSV) is counted
 * as a duplicate and kept exactly once; the first occurrence wins.
 */
export async function importContactsFromCsv(csvText: string): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new AppError(400, 'The CSV file is empty.');

  const [header, ...dataRows] = rows;
  let phoneIndex = header.findIndex(isPhoneHeader);
  let nameIndex = header.findIndex(isNameHeader);
  let bodyRows = dataRows;

  if (phoneIndex === -1) {
    if (header.length === 1) {
      // A bare list of numbers, one per line, whatever the single header
      // cell says (or doesn't say) — still usable.
      phoneIndex = 0;
      bodyRows = dataRows;
    } else {
      throw new AppError(400, 'The CSV must have a column named Phone (or Mobile/Number).');
    }
  }

  return withFileLock(async () => {
    const existing = await readContacts();
    const seen = new Set(existing.map((c) => c.phone));
    const importedAt = new Date().toISOString();

    let imported = 0;
    let skippedDuplicates = 0;
    let skippedInvalid = 0;
    const next = [...existing];

    for (const row of bodyRows) {
      const rawPhone = (row[phoneIndex] ?? '').trim();
      if (!rawPhone) continue;
      const phone = toE164(rawPhone);
      if (!isValidE164(phone)) { skippedInvalid += 1; continue; }
      if (seen.has(phone)) { skippedDuplicates += 1; continue; }
      seen.add(phone);
      const name = nameIndex >= 0 ? (row[nameIndex] ?? '').trim() || null : null;
      next.push({ phone, name, importedAt });
      imported += 1;
    }

    await writeContactsAtomic(next);
    return { imported, skippedDuplicates, skippedInvalid, totalContacts: next.length };
  });
}

export async function deleteContacts(phones: string[]): Promise<{ deleted: number }> {
  const targets = new Set(phones.map(toE164));
  return withFileLock(async () => {
    const existing = await readContacts();
    const remaining = existing.filter((c) => !targets.has(c.phone));
    await writeContactsAtomic(remaining);
    return { deleted: existing.length - remaining.length };
  });
}

/** Bulk-sends one message to a set of imported contacts — thin wrapper
 *  over the same sendBulkSms every other bulk-SMS admin action uses. */
export async function sendSmsToContacts(phones: string[], message: string) {
  const result = await sendBulkSms(phones, message);
  const sentCount = result.recipients.filter((r) => r.success).length;
  const failedCount = result.recipients.length - sentCount;
  return { requested: phones.length, sentCount, failedCount, recipients: result.recipients };
}
