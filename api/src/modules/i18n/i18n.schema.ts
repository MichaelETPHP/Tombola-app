import { z } from 'zod';

export const upsertI18nStringSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().max(5000),
});

export type UpsertI18nStringInput = z.infer<typeof upsertI18nStringSchema>;
