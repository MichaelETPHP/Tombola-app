import { z } from 'zod';

export const createRaffleSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  prizeName: z.string().min(2).max(200),
  prizeValue: z.number().positive(),
  ticketPrice: z.number().positive(),
  ticketCap: z.number().int().positive().min(10),
  maxTicketsPerUser: z.number().int().positive().min(1).max(100),
  deadlineDays: z.number().int().positive().min(1).max(90),
});

export const listRafflesSchema = z.object({
  status: z.enum(['open', 'locked', 'drawing', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateRaffleInput = z.infer<typeof createRaffleSchema>;
export type ListRafflesInput = z.infer<typeof listRafflesSchema>;
