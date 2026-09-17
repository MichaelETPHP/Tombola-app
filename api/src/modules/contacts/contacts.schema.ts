import { z } from 'zod';

// Mirrors the bulk-SMS cap already used for registered users (see
// admin.schema.ts::bulkSmsSchema) — same reasoning: a sane ceiling on how
// much one admin action can affect at once.
export const sendContactsSmsSchema = z.object({
  phones: z.array(z.string()).min(1).max(500),
  message: z.string().trim().min(1).max(1000),
});

export const deleteContactsSchema = z.object({
  phones: z.array(z.string()).min(1).max(500),
});
