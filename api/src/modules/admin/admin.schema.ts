import { z } from 'zod';

export const listUsersSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

export const adminLoginSchema = z.object({
  phone: z.string().trim().transform((value) => {
    if (value.startsWith('+251')) return value;
    if (value.startsWith('0')) return `+251${value.slice(1)}`;
    if (value.startsWith('9')) return `+251${value}`;
    return value;
  }).pipe(z.string().regex(/^\+251[0-9]{9}$/, 'Invalid Ethiopian phone number')),
  password: z.string().min(8),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
