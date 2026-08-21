import { z } from 'zod';

export const chapaWebhookSchema = z.object({
  event: z.string(),
  tx_ref: z.string(),
  status: z.string(),
  amount: z.number().optional(),
  currency: z.string().optional(),
});

export type ChapaWebhookPayload = z.infer<typeof chapaWebhookSchema>;
