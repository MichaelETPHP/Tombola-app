import { z } from 'zod';

export const triggerDrawSchema = z.object({
  token: z.string().min(1),
});

export type TriggerDrawInput = z.infer<typeof triggerDrawSchema>;
