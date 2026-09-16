/**
 * Minimal RFC4180 CSV parser — handles quoted fields, escaped quotes (""),
 * commas/newlines inside quotes, and both \n and \r\n line endings. No
 * dependency needed for the one shape this app parses (a simple contacts
 * export), so this stays self-contained rather than pulling in a library
 * for a handful of well-understood rules.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }
    if (char === '"') { inQuotes = true; i += 1; continue; }
    if (char === ',') { pushField(); i += 1; continue; }
    if (char === '\r') { i += 1; continue; }
    if (char === '\n') { pushRow(); i += 1; continue; }
    field += char; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  // Rows that are entirely blank cells (trailing newline, stray blank line
  // in the middle of the file) carry no data — drop them rather than
  // making every caller filter them out itself.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}
