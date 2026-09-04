import { z } from 'zod';

export const listUsersSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listAuditLogSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  entityType: z.string().trim().min(1).optional(),
  actorType: z.enum(['user', 'admin', 'system']).optional(),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

const adminPhone = z.string().trim().transform((value) => {
  if (value.startsWith('+251')) return value;
  if (value.startsWith('0')) return `+251${value.slice(1)}`;
  if (value.startsWith('9')) return `+251${value}`;
  return value;
}).pipe(z.string().regex(/^\+251[0-9]{9}$/, 'Invalid Ethiopian phone number'));

export const adminLoginSchema = z.object({
  phone: adminPhone,
  password: z.string().min(8),
});

// Password change is opt-in — omit both fields to leave it as-is. If
// changing it, the current password must be confirmed even though the
// request is already authenticated, same reasoning any "change password"
// flow uses: a stolen/left-open session shouldn't be enough on its own to
// lock the real owner out by changing their password.
export const updateOwnProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
}).refine(
  (data) => !data.newPassword || Boolean(data.currentPassword),
  { message: 'Current password is required to set a new one', path: ['currentPassword'] }
);

export const createAdminSchema = z.object({
  phone: adminPhone,
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(255).optional(),
  role: z.enum(['owner', 'moderator']).default('moderator'),
});

export const updateAdminSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  role: z.enum(['owner', 'moderator']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type ListAuditLogInput = z.infer<typeof listAuditLogSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
