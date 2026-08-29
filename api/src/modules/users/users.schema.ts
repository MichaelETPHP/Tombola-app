import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  preferredLanguage: z.enum(['en', 'am']).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
