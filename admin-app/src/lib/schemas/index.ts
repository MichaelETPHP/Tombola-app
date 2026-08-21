import { z } from 'zod';

// ── Auth Schemas ─────────────────────────────────────────
// NOTE: POST /admin/auth/login does not exist on the API yet — there is no
// admins table in the schema to authenticate against. This form and schema
// are ready for it; wire it up once docs/schema.sql defines admin accounts.

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const adminSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: z.enum(['owner', 'moderator']),
});

export const adminAuthResponseSchema = z.object({
  accessToken: z.string(),
  admin: adminSchema,
});

// ── Raffle Schemas ───────────────────────────────────────
// Mirrors api/src/modules/raffles/raffles.schema.ts::createRaffleSchema exactly.

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

// ── Payout Schemas ───────────────────────────────────────

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['verified', 'fulfilled', 'rejected']),
  notes: z.string().max(1000).optional(),
});

export const payoutSchema = z.object({
  id: z.string(),
  drawId: z.string(),
  raffleId: z.string(),
  winnerUserId: z.string(),
  status: z.enum(['pending_claim', 'claimed', 'verified', 'fulfilled', 'expired', 'rejected']),
  claimDeadline: z.string(),
  idDocumentUrl: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  deliveryPhone: z.string().nullable(),
  adminNotes: z.string().nullable(),
  createdAt: z.string(),
});

// ── User Schemas ─────────────────────────────────────────

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

// ── Inferred Types ───────────────────────────────────────

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type Admin = z.infer<typeof adminSchema>;
export type AdminAuthResponse = z.infer<typeof adminAuthResponseSchema>;
export type CreateRaffleInput = z.infer<typeof createRaffleSchema>;
export type Raffle = z.infer<typeof raffleSchema>;
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;
export type Payout = z.infer<typeof payoutSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
