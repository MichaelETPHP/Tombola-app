import { z } from 'zod';

export const clientCrashSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  url: z.string().max(2000).optional(),
  platform: z.enum(['telegram', 'native', 'browser']).default('browser'),
  userAgent: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
  selfHealed: z.boolean().default(false),
});
