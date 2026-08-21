import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────────

export const requestOtpSchema = z.object({
  phone: z.string().min(9).max(15),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().length(6).regex(/^[0-9]{6}$/),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    phone: z.string(),
    fullName: z.string().nullable(),
    isNewUser: z.boolean(),
  }),
});

// ── Raffle Schemas ───────────────────────────────────────

export const raffleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  prizeName: z.string(),
  prizeValue: z.number(),
  prizeImageUrl: z.string().nullable(),
  ticketPrice: z.number(),
  ticketCap: z.number(),
  ticketsSold: z.number(),
  maxTicketsPerUser: z.number(),
  status: z.enum(['open', 'locked', 'drawing', 'completed', 'cancelled']),
  currentDeadline: z.string(),
  createdAt: z.string(),
});

export const raffleListResponseSchema = z.object({
  raffles: z.array(raffleSchema),
});

// ── Ticket Schemas ───────────────────────────────────────

export const purchaseTicketsSchema = z.object({
  quantity: z.number().int().positive().min(1).max(100),
  paymentGateway: z.enum(['chapa', 'telebirr']).default('chapa'),
});

// ── Inferred Types ───────────────────────────────────────

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Raffle = z.infer<typeof raffleSchema>;
export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
