import { z } from 'zod';

export const listUsersSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
