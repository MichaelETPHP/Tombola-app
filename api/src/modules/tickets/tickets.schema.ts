import { z } from 'zod';

export const purchaseTicketsSchema = z.object({
  quantity: z.number().int().min(1).max(5),
  paymentGateway: z.enum(['chapa', 'telebirr']).default('chapa'),
  returnTarget: z.enum(['web', 'native']).default('web'),
});

export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
