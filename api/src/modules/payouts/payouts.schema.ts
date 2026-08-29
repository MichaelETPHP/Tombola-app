import { z } from 'zod';

export const submitClaimSchema = z.object({
  deliveryMethod: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().min(5).max(500),
});

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['verified', 'fulfilled', 'rejected']),
});

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;
