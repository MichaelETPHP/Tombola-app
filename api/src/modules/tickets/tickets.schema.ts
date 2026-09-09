import { z } from 'zod';
import { selectedNumbersSchema } from './selection.js';

export const purchaseTicketsSchema = z.object({
  quantity: z.number().int().min(1).max(4).optional(),
  selectedNumbers: selectedNumbersSchema.optional(),
  idempotencyKey: z.string().uuid().optional(),
  paymentGateway: z.literal('chapa').default('chapa'),
  returnTarget: z.enum(['web', 'native']).default('web'),
}).superRefine((value, ctx) => {
  if (!value.selectedNumbers && !value.quantity) ctx.addIssue({ code: 'custom', message: 'Choose ticket numbers or a quantity' });
  if (value.selectedNumbers && !value.idempotencyKey) ctx.addIssue({ code: 'custom', path: ['idempotencyKey'], message: 'An idempotency key is required for number selection' });
  if (value.selectedNumbers && value.quantity !== undefined && value.quantity !== value.selectedNumbers.length) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must match selected numbers' });
});

export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
