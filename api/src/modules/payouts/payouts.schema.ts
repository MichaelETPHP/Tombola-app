import { z } from 'zod';

export const submitClaimSchema = z.object({
  deliveryMethodId: z.string().uuid(),
  // Required only for a method that actually needs it — enforced in the
  // service layer, where the method's own requiresDetails flag is known,
  // not here where it isn't.
  deliveryAddress: z.string().max(500).optional(),
});

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['verified', 'fulfilled', 'rejected']),
});

export const createDeliveryMethodSchema = z.object({
  label: z.string().min(1).max(100),
  requiresDetails: z.boolean(),
  detailsLabel: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateDeliveryMethodSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  requiresDetails: z.boolean().optional(),
  detailsLabel: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;
export type CreateDeliveryMethodInput = z.infer<typeof createDeliveryMethodSchema>;
export type UpdateDeliveryMethodInput = z.infer<typeof updateDeliveryMethodSchema>;
