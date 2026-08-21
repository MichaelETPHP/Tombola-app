import { z } from 'zod';

export const submitClaimSchema = z.object({
  deliveryAddress: z.string().min(5).max(500),
  deliveryPhone: z.string().min(9).max(15),
});

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['verified', 'fulfilled', 'rejected']),
  notes: z.string().max(1000).optional(),
});

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;
