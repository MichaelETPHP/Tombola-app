/** Treat persisted user-supplied URLs as untrusted, including historical rows. */
export function safeDocumentUrl(value: string | null | undefined, apiBase: string): string | null {
  if (!value) return null;
  try {
    const url = value.startsWith('/uploads/') ? new URL(value, apiBase) : new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
