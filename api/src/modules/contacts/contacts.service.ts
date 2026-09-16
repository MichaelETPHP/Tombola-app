import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { parseCsv } from '../../lib/csv.js';
import { sendBulkSmsWithSummaryLog, toE164, isValidE164 } from '../../lib/sms.js';
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

/**
 * Matches a CSV header cell to what it's meant to hold. Word-boundary
 * matching, not a bare substring test, specifically because a real Google
 * Contacts export has a "Phonetic First Name" column — a naive /phone/i
 * test matches that too (it's the same 5 letters), silently pulling
 * transliterated names in as "phone numbers." Google also exports up to 5
 * numbers per contact as separate "Phone 1 - Value" .. "Phone 5 - Value"
 * columns (each paired with its own "Phone N - Label" column, which must
 * NOT be treated as a phone source either) — every matching column is
 * used, not just the first, so a contact's 2nd/3rd number isn't dropped.
 */
function isPhoneValueHeader(header: string): boolean {
  const h = header.trim();
  if (/\b(label|type)\b/i.test(h)) return false;
  return /\b(phone|mobile|tel|telephone|number)\b/i.test(h);
}
function isNameHeader(header: string): boolean {
  return /\bname\b/i.test(header) && !/\b(organization|company|file\s*as|phonetic|nickname)\b/i.test(header);
}

/**
 * A CSV sourced from elsewhere can have genuinely messy rows — Google
 * Contacts exports in particular sometimes have a phone number typed into
 * the name field itself (comma-split across First/Middle/Last Name by
 * whatever created the original entry). A "name" that's actually just
 * digits/phone punctuation is worse than no name at all, so it's dropped
 * rather than stored as a nonsense label.
 */
function looksLikeRealName(value: string): boolean {
  return !/^[\s\d+().-]*$/.test(value);
}

/** Prefers Google's separate First/Last Name columns (combined); falls
 *  back to a single generic name-ish column for a simpler CSV. */
function extractName(row: string[], firstNameIndex: number, lastNameIndex: number, genericNameIndex: number): string | null {
  if (firstNameIndex >= 0 || lastNameIndex >= 0) {
    const first = firstNameIndex >= 0 ? (row[firstNameIndex] ?? '').trim() : '';
    const last = lastNameIndex >= 0 ? (row[lastNameIndex] ?? '').trim() : '';
    const combined = [first, last].filter(Boolean).join(' ').trim();
    if (combined && looksLikeRealName(combined)) return combined;
  }
  if (genericNameIndex >= 0) {
    const value = (row[genericNameIndex] ?? '').trim();
    if (value && looksLikeRealName(value)) return value;
  }
  return null;
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
  let phoneIndexes = header.reduce<number[]>((acc, h, i) => {
    if (isPhoneValueHeader(h)) acc.push(i);
    return acc;
  }, []);
  const firstNameIndex = header.findIndex((h) => h.trim().toLowerCase() === 'first name');
  const lastNameIndex = header.findIndex((h) => h.trim().toLowerCase() === 'last name');
  const genericNameIndex = header.findIndex(isNameHeader);

  if (phoneIndexes.length === 0) {
    if (header.length === 1) {
      // A bare list of numbers, one per line, whatever the single header
      // cell says (or doesn't say) — still usable.
      phoneIndexes = [0];
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

    for (const row of dataRows) {
      const name = extractName(row, firstNameIndex, lastNameIndex, genericNameIndex);
      // A contact can have more than one number (Google exports up to 5
      // per person as separate columns) — every one of them is a distinct,
      // independently valid SMS recipient, so all are imported under the
      // same name rather than keeping only the first.
      for (const phoneIndex of phoneIndexes) {
        const rawPhone = (row[phoneIndex] ?? '').trim();
        if (!rawPhone) continue;
        const phone = toE164(rawPhone);
        // isValidE164 requires a literal +251 prefix (see sms.ts) — a
        // contact list sourced from elsewhere can easily contain a foreign
        // number, and this gateway only ever reaches Ethiopian phones, so
        // any other country's number is rejected here as "invalid" right
        // alongside genuinely malformed ones. Deliberate, not a limitation
        // to fix — see the admin page's own note to this effect.
        if (!isValidE164(phone)) { skippedInvalid += 1; continue; }
        if (seen.has(phone)) { skippedDuplicates += 1; continue; }
        seen.add(phone);
        next.push({ phone, name, importedAt });
        imported += 1;
      }
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

/**
 * Bulk-sends one message to a set of imported contacts. Unlike the
 * registered-users bulk-SMS action, this logs ONE summary row in the admin
 * SMS log ("Contacts broadcast — 45/50 delivered") instead of one row per
 * recipient — these aren't platform accounts, so a per-recipient audit
 * trail isn't the point; a delivery report for the broadcast is.
 */
export async function sendSmsToContacts(phones: string[], message: string) {
  const result = await sendBulkSmsWithSummaryLog(phones, message, 'contacts_broadcast');
  const sentCount = result.recipients.filter((r) => r.success).length;
  const failedCount = result.recipients.length - sentCount;
  return { requested: phones.length, sentCount, failedCount, recipients: result.recipients };
}
