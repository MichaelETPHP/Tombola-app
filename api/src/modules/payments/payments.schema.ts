import { z } from 'zod';

export const chapaWebhookSchema = z.object({
  event: z.string(),
  tx_ref: z.string(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
}).passthrough();

export type ChapaWebhookPayload = z.infer<typeof chapaWebhookSchema>;
