import { z } from 'zod';

export const purchaseTicketsSchema = z.object({
  quantity: z.number().int().positive().min(1).max(100),
  paymentGateway: z.enum(['chapa', 'telebirr']).default('chapa'),
});

export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
